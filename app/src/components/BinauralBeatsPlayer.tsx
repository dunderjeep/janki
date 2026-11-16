'use client'

import { useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type WaveType    = OscillatorType
type DrumType    = 'kick' | 'snare' | 'hihat' | 'click'
type PatternType = 'quarter' | 'eighth' | 'triplet' | 'swing'

type Preset = { label: string; beat: number; carrier: number; description: string }

// ── Presets ───────────────────────────────────────────────────────────────────

const PRESETS: Preset[] = [
  { label: 'Delta', beat: 2,  carrier: 150, description: 'Deep sleep (2 Hz)'        },
  { label: 'Theta', beat: 6,  carrier: 180, description: 'Meditation (6 Hz)'        },
  { label: 'Alpha', beat: 10, carrier: 200, description: 'Relaxed focus (10 Hz)'    },
  { label: 'Beta',  beat: 20, carrier: 220, description: 'Active thinking (20 Hz)'  },
  { label: 'Gamma', beat: 40, carrier: 240, description: 'Peak focus (40 Hz)'       },
]

// ── Drum synthesis ────────────────────────────────────────────────────────────

function makeNoiseBuf(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 2
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d   = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function synthKick(ctx: AudioContext, t: number, vol: number) {
  const osc = ctx.createOscillator(); const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(150, t)
  osc.frequency.exponentialRampToValueAtTime(50, t + 0.2)
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t); osc.stop(t + 0.36)
}

function synthSnare(ctx: AudioContext, t: number, nb: AudioBuffer, vol: number) {
  const src = ctx.createBufferSource(); src.buffer = nb
  const filt = ctx.createBiquadFilter()
  filt.type = 'bandpass'; filt.frequency.value = 1500; filt.Q.value = 0.5
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(vol, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15)
  src.connect(filt).connect(gain).connect(ctx.destination)
  src.start(t); src.stop(t + 0.16)
}

function synthHihat(ctx: AudioContext, t: number, nb: AudioBuffer, vol: number) {
  const src = ctx.createBufferSource(); src.buffer = nb
  const filt = ctx.createBiquadFilter()
  filt.type = 'highpass'; filt.frequency.value = 8000
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(vol * 0.4, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
  src.connect(filt).connect(gain).connect(ctx.destination)
  src.start(t); src.stop(t + 0.07)
}

function synthClick(ctx: AudioContext, t: number, vol: number) {
  const osc = ctx.createOscillator(); const gain = ctx.createGain()
  osc.type = 'sine'; osc.frequency.value = 1200
  gain.gain.setValueAtTime(vol * 0.8, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.015)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t); osc.stop(t + 0.02)
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Settings, and whether it was playing, kept across page reloads. A reload
 * (after janki is redeployed, say) ends the audio, and browsers only let
 * sound start again from a click or a key, so it resumes on the next one.
 */
const STORE_KEY = 'janki.binaural'

type Saved = {
  playing: boolean; beatFreq: number; carrier: number; waveType: WaveType; toneVol: number; presetIdx: number
  pulseOn: boolean; pulseRate: number; pulseDepth: number; pulseShape: 'sine' | 'square'; syncToBeat: boolean
  percOn: boolean; bpm: number; drumType: DrumType; pattern: PatternType; percVol: number
}

function readSaved(): Partial<Saved> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<Saved>
  } catch {
    return {}
  }
}

export default function BinauralBeatsPlayer() {
  // Tone params
  const [beatFreq,  setBeatFreq ] = useState(10)
  const [carrier,   setCarrier  ] = useState(200)
  const [waveType,  setWaveType ] = useState<WaveType>('sine')
  const [toneVol,   setToneVol  ] = useState(0.3)
  const [presetIdx, setPresetIdx] = useState(2)

  // Pulse / LFO params
  const [pulseOn,    setPulseOn   ] = useState(false)
  const [pulseRate,  setPulseRate ] = useState(4)        // Hz — how fast it pulses
  const [pulseDepth, setPulseDepth] = useState(0.7)      // 0–1 — how deep volume dips
  const [pulseShape, setPulseShape] = useState<'sine' | 'square'>('sine')
  const [syncToBeat, setSyncToBeat] = useState(false)    // lock rate to beat frequency

  // Percussion params
  const [percOn,   setPercOn  ] = useState(false)
  const [bpm,      setBpm     ] = useState(80)
  const [drumType, setDrumType] = useState<DrumType>('click')
  const [pattern,  setPattern ] = useState<PatternType>('quarter')
  const [percVol,  setPercVol ] = useState(0.25)

  // UI
  const [playing, setPlaying] = useState(false)
  const [open,    setOpen    ] = useState(false)
  const [resuming, setResuming] = useState(false)
  const restored = useRef(false)

  // Audio graph refs
  const ctxRef      = useRef<AudioContext | null>(null)
  const leftRef     = useRef<OscillatorNode | null>(null)
  const rightRef    = useRef<OscillatorNode | null>(null)
  const toneGainRef = useRef<GainNode | null>(null)
  const noiseBufRef = useRef<AudioBuffer | null>(null)

  // LFO refs
  const lfoRef     = useRef<OscillatorNode | null>(null)
  const lfoGainRef = useRef<GainNode | null>(null)

  // Scheduler ref
  const schedRef = useRef<{
    intervalId: ReturnType<typeof setInterval>
    nextNoteTime: number
    swingPhase: boolean
  } | null>(null)

  // Refs for scheduler tick (avoids stale closures)
  const bpmRef      = useRef(bpm)
  const drumTypeRef = useRef(drumType)
  const patternRef  = useRef(pattern)
  const percVolRef  = useRef(percVol)

  useEffect(() => { bpmRef.current      = bpm      }, [bpm])
  useEffect(() => { drumTypeRef.current = drumType  }, [drumType])
  useEffect(() => { patternRef.current  = pattern   }, [pattern])
  useEffect(() => { percVolRef.current  = percVol   }, [percVol])

  // ── Effective pulse rate (synced or manual) ────────────────────────────────
  const effectivePulseRate = syncToBeat ? beatFreq : pulseRate

  // ── Live tone updates ──────────────────────────────────────────────────────

  useEffect(() => {
    if (leftRef.current)  leftRef.current.frequency.value  = carrier
    if (rightRef.current) rightRef.current.frequency.value = carrier + beatFreq
  }, [carrier, beatFreq])

  useEffect(() => {
    if (leftRef.current)  leftRef.current.type = waveType
    if (rightRef.current) rightRef.current.type = waveType
  }, [waveType])

  useEffect(() => {
    if (toneGainRef.current) toneGainRef.current.gain.value = toneVol
    if (lfoGainRef.current)  lfoGainRef.current.gain.value  = toneVol * pulseDepth
  }, [toneVol, pulseDepth])

  // ── Live LFO updates ───────────────────────────────────────────────────────

  useEffect(() => {
    if (lfoRef.current) lfoRef.current.frequency.value = effectivePulseRate
  }, [effectivePulseRate])

  useEffect(() => {
    if (lfoRef.current) lfoRef.current.type = pulseShape
  }, [pulseShape])

  // ── Preset selection ───────────────────────────────────────────────────────

  function selectPreset(idx: number) {
    setPresetIdx(idx)
    setBeatFreq(PRESETS[idx].beat)
    setCarrier(PRESETS[idx].carrier)
  }

  // ── LFO pulse start / stop ─────────────────────────────────────────────────

  function startPulse(ctx: AudioContext) {
    if (lfoRef.current || !toneGainRef.current) return
    const lfo     = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.type            = pulseShape
    lfo.frequency.value = effectivePulseRate
    // lfoGain scales the ±1 LFO signal into ±(toneVol * depth)
    // so gain AudioParam oscillates around its DC value (toneVol)
    lfoGain.gain.value  = toneVol * pulseDepth
    lfo.connect(lfoGain)
    lfoGain.connect(toneGainRef.current.gain)  // modulate the gain param
    lfo.start()
    lfoRef.current     = lfo
    lfoGainRef.current = lfoGain
  }

  function stopPulse() {
    lfoRef.current?.stop()
    lfoRef.current     = null
    lfoGainRef.current = null
  }

  // ── Percussion scheduler ───────────────────────────────────────────────────

  function startPerc(ctx: AudioContext) {
    if (schedRef.current) return
    const state = {
      intervalId:   0 as unknown as ReturnType<typeof setInterval>,
      nextNoteTime: ctx.currentTime,
      swingPhase:   false,
    }
    schedRef.current = state

    function tick() {
      if (!ctxRef.current) return
      const c = ctxRef.current; const nb = noiseBufRef.current!
      while (state.nextNoteTime < c.currentTime + 0.1) {
        const t = state.nextNoteTime; const vol = percVolRef.current
        switch (drumTypeRef.current) {
          case 'kick':  synthKick(c, t, vol);      break
          case 'snare': synthSnare(c, t, nb, vol); break
          case 'hihat': synthHihat(c, t, nb, vol); break
          case 'click': synthClick(c, t, vol);     break
        }
        const beat = 60 / bpmRef.current
        switch (patternRef.current) {
          case 'quarter':  state.nextNoteTime += beat;     break
          case 'eighth':   state.nextNoteTime += beat / 2; break
          case 'triplet':  state.nextNoteTime += beat / 3; break
          case 'swing':
            state.nextNoteTime += state.swingPhase ? beat * 0.33 : beat * 0.67
            state.swingPhase = !state.swingPhase; break
        }
      }
    }
    tick()
    state.intervalId = setInterval(tick, 25)
  }

  function stopPerc() {
    if (schedRef.current) { clearInterval(schedRef.current.intervalId); schedRef.current = null }
  }

  // ── Play / Stop ────────────────────────────────────────────────────────────

  function play() {
    if (ctxRef.current) return  // already playing: a resume and a Play click can land together
    const ctx = new AudioContext()
    ctxRef.current      = ctx
    noiseBufRef.current = makeNoiseBuf(ctx)

    const gain = ctx.createGain(); gain.gain.value = toneVol
    const panL = ctx.createStereoPanner(); panL.pan.value = -1
    const panR = ctx.createStereoPanner(); panR.pan.value =  1
    const oscL = ctx.createOscillator()
    oscL.type = waveType; oscL.frequency.value = carrier
    const oscR = ctx.createOscillator()
    oscR.type = waveType; oscR.frequency.value = carrier + beatFreq

    oscL.connect(panL).connect(gain).connect(ctx.destination)
    oscR.connect(panR).connect(gain).connect(ctx.destination)
    oscL.start(); oscR.start()

    leftRef.current     = oscL
    rightRef.current    = oscR
    toneGainRef.current = gain

    if (pulseOn) startPulse(ctx)
    if (percOn)  startPerc(ctx)
    setPlaying(true)
  }

  function stop() {
    stopPerc()
    stopPulse()
    leftRef.current?.stop()
    rightRef.current?.stop()
    leftRef.current = rightRef.current = toneGainRef.current = null
    noiseBufRef.current = null
    ctxRef.current?.close(); ctxRef.current = null
    setPlaying(false)
  }

  // Toggle pulse/perc independently while playing
  useEffect(() => {
    if (!playing || !ctxRef.current) return
    if (pulseOn) startPulse(ctxRef.current)
    else stopPulse()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseOn])

  useEffect(() => {
    if (!playing || !ctxRef.current) return
    if (percOn) startPerc(ctxRef.current)
    else stopPerc()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percOn])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stop(), [])

  // ── Surviving a reload ─────────────────────────────────────────────────────

  useEffect(() => {
    const s = readSaved()
    if (typeof s.beatFreq === 'number') setBeatFreq(s.beatFreq)
    if (typeof s.carrier === 'number') setCarrier(s.carrier)
    if (s.waveType) setWaveType(s.waveType)
    if (typeof s.toneVol === 'number') setToneVol(s.toneVol)
    if (typeof s.presetIdx === 'number') setPresetIdx(s.presetIdx)
    if (typeof s.pulseOn === 'boolean') setPulseOn(s.pulseOn)
    if (typeof s.pulseRate === 'number') setPulseRate(s.pulseRate)
    if (typeof s.pulseDepth === 'number') setPulseDepth(s.pulseDepth)
    if (s.pulseShape) setPulseShape(s.pulseShape)
    if (typeof s.syncToBeat === 'boolean') setSyncToBeat(s.syncToBeat)
    if (typeof s.percOn === 'boolean') setPercOn(s.percOn)
    if (typeof s.bpm === 'number') setBpm(s.bpm)
    if (s.drumType) setDrumType(s.drumType)
    if (s.pattern) setPattern(s.pattern)
    if (typeof s.percVol === 'number') setPercVol(s.percVol)
    if (s.playing) setResuming(true)
    restored.current = true
  }, [])

  useEffect(() => {
    if (!restored.current) return
    const saved: Saved = {
      playing: playing || resuming, beatFreq, carrier, waveType, toneVol, presetIdx,
      pulseOn, pulseRate, pulseDepth, pulseShape, syncToBeat, percOn, bpm, drumType, pattern, percVol,
    }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(saved))
    } catch {
      // Private window or storage full: the player still works, it just forgets.
    }
  }, [playing, resuming, beatFreq, carrier, waveType, toneVol, presetIdx, pulseOn, pulseRate, pulseDepth, pulseShape, syncToBeat, percOn, bpm, drumType, pattern, percVol])

  // The latest play(), for a listener added before the restored settings rendered.
  const playRef = useRef(play)
  playRef.current = play

  useEffect(() => {
    if (!resuming) return
    const resume = () => {
      setResuming(false)
      if (!ctxRef.current) playRef.current()
    }
    window.addEventListener('pointerdown', resume, { once: true, capture: true })
    window.addEventListener('keydown', resume, { once: true, capture: true })
    return () => {
      window.removeEventListener('pointerdown', resume, { capture: true })
      window.removeEventListener('keydown', resume, { capture: true })
    }
  }, [resuming])

  // ── Option definitions ─────────────────────────────────────────────────────

  const WAVE_OPTIONS: { type: WaveType; label: string; title: string }[] = [
    { type: 'sine',     label: 'Sine', title: 'Sine — pure, standard'          },
    { type: 'triangle', label: 'Tri',  title: 'Triangle — softer harmonics'    },
    { type: 'square',   label: 'Sq',   title: 'Square — rich odd harmonics'    },
    { type: 'sawtooth', label: 'Saw',  title: 'Sawtooth — bright harmonics'    },
  ]

  const DRUM_OPTIONS: { type: DrumType; label: string }[] = [
    { type: 'kick', label: 'Kick' }, { type: 'snare', label: 'Snare' },
    { type: 'hihat', label: 'Hi-hat' }, { type: 'click', label: 'Click' },
  ]

  const PATTERN_OPTIONS: { type: PatternType; label: string; title: string }[] = [
    { type: 'quarter', label: '♩',   title: 'Quarter — one per beat'     },
    { type: 'eighth',  label: '♪♪',  title: 'Eighth notes — two per beat'},
    { type: 'triplet', label: '♪♪♪', title: 'Triplets — three per beat'  },
    { type: 'swing',   label: '↕',   title: 'Swing — swung eighth notes' },
  ]

  // ── Shared UI helpers ──────────────────────────────────────────────────────

  function SectionLabel({ children }: { children: React.ReactNode }) {
    return <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{children}</p>
  }

  function SliderRow({ label, value, display, min, max, step, onChange }: {
    label: string; value: number; display: string
    min: number; max: number; step: number
    onChange: (v: number) => void
  }) {
    return (
      <div className="space-y-0.5">
        <div className="flex justify-between text-xs text-gray-500">
          <span>{label}</span><span className="tabular-nums">{display}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))} className="w-full accent-indigo-600" />
      </div>
    )
  }

  function ToggleSwitch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
      <button onClick={() => onChange(!on)} aria-label={label}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors
          ${on ? 'bg-indigo-600' : 'bg-gray-200'}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform
          ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    )
  }

  function ButtonGrid<T extends string>({ options, value, onSelect, cols = 4 }: {
    options: { type: T; label: string; title?: string }[]
    value: T; onSelect: (t: T) => void; cols?: number
  }) {
    return (
      <div className={`grid gap-1`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {options.map(o => (
          <button key={o.type} onClick={() => onSelect(o.type)} title={o.title}
            className={`py-1.5 rounded-lg text-xs font-medium transition-colors
              ${value === o.type
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'}`}>
            {o.label}
          </button>
        ))}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative">

      {/* Toolbar button */}
      <button onClick={() => setOpen(o => !o)}
        title={resuming ? 'Binaural Beats: the page reloaded. Click anywhere or press a key to resume' : 'Binaural Beats'}
        aria-label="Binaural Beats Player"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
          ${playing
            ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
            : resuming
              ? 'bg-indigo-50 text-indigo-700 border-indigo-300 animate-pulse'
              : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'}`}>
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/>
          <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
        </svg>
        {playing && (
          <span className="flex gap-0.5 items-end h-3">
            {[1, 2, 3].map(i => (
              <span key={i} className="w-0.5 bg-white rounded-full animate-pulse"
                style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-4 space-y-4 max-h-[85vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">Binaural Beats</span>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                </svg>
              </button>
            </div>

            {/* ══ TONES ══ */}
            <section className="space-y-3">
              <SectionLabel>Tones</SectionLabel>
              <div className="grid grid-cols-5 gap-1">
                {PRESETS.map((p, i) => (
                  <button key={p.label} onClick={() => selectPreset(i)} title={p.description}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-colors
                      ${i === presetIdx
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <SliderRow label="Beat frequency" value={beatFreq} display={`${beatFreq.toFixed(1)} Hz`}
                min={0.5} max={40} step={0.5}
                onChange={v => { setBeatFreq(v); setPresetIdx(-1) }} />
              <SliderRow label="Carrier frequency" value={carrier} display={`${carrier} Hz`}
                min={80} max={400} step={5}
                onChange={v => { setCarrier(v); setPresetIdx(-1) }} />
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Waveform</p>
                <ButtonGrid options={WAVE_OPTIONS} value={waveType} onSelect={setWaveType} />
              </div>
              <SliderRow label="Tone volume" value={toneVol} display={`${Math.round(toneVol * 100)}%`}
                min={0} max={1} step={0.01} onChange={setToneVol} />
            </section>

            {/* ══ PULSE / LFO ══ */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionLabel>Pulse / Throb</SectionLabel>
                <ToggleSwitch on={pulseOn} onChange={setPulseOn} label="Toggle pulse" />
              </div>
              {pulseOn && (
                <div className="space-y-3">
                  {/* Rate — with sync-to-beat button */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>Rate</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSyncToBeat(v => !v)}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors
                            ${syncToBeat
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                          sync to beat
                        </button>
                        <span className="tabular-nums">
                          {effectivePulseRate.toFixed(1)} Hz
                        </span>
                      </div>
                    </div>
                    <input type="range" min={0.25} max={20} step={0.25}
                      value={syncToBeat ? beatFreq : pulseRate}
                      disabled={syncToBeat}
                      onChange={e => setPulseRate(Number(e.target.value))}
                      className="w-full accent-indigo-600 disabled:opacity-40" />
                  </div>
                  {/* Depth */}
                  <SliderRow label="Depth (how far volume dips)" value={pulseDepth}
                    display={`${Math.round(pulseDepth * 100)}%`}
                    min={0} max={1} step={0.01} onChange={setPulseDepth} />
                  {/* Shape */}
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Shape</p>
                    <div className="grid grid-cols-2 gap-1">
                      {([
                        { type: 'sine',   label: '∿ Smooth', title: 'Sine — gentle organic throb' },
                        { type: 'square', label: '⊓ Hard',   title: 'Square — isochronic sharp pulse' },
                      ] as { type: 'sine'|'square'; label: string; title: string }[]).map(o => (
                        <button key={o.type} onClick={() => setPulseShape(o.type)} title={o.title}
                          className={`py-1.5 rounded-lg text-xs font-medium transition-colors
                            ${pulseShape === o.type
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 leading-snug">
                      {pulseShape === 'square' && syncToBeat
                        ? 'Isochronic tones — works without headphones'
                        : pulseShape === 'square'
                        ? 'Hard on/off pulse — very rhythmic'
                        : 'Smooth volume wave — deep organic throb'}
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* ══ PERCUSSION ══ */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionLabel>Percussion</SectionLabel>
                <ToggleSwitch on={percOn} onChange={setPercOn} label="Toggle percussion" />
              </div>
              {percOn && (
                <div className="space-y-3">
                  <SliderRow label="BPM" value={bpm} display={`${bpm}`}
                    min={40} max={180} step={1} onChange={setBpm} />
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Sound</p>
                    <ButtonGrid options={DRUM_OPTIONS} value={drumType} onSelect={setDrumType} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Pattern</p>
                    <ButtonGrid options={PATTERN_OPTIONS} value={pattern} onSelect={setPattern} />
                  </div>
                  <SliderRow label="Perc volume" value={percVol} display={`${Math.round(percVol * 100)}%`}
                    min={0} max={1} step={0.01} onChange={setPercVol} />
                </div>
              )}
            </section>

            {/* Play / Stop */}
            <button onClick={playing ? stop : play}
              className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors
                ${playing
                  ? 'bg-red-50 text-red-600 hover:bg-red-100'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
              {playing ? '⏹ Stop' : '▶ Play'}
            </button>

            <p className="text-[10px] text-gray-300 text-center">Use headphones for binaural effect</p>
          </div>
        </>
      )}
    </div>
  )
}
