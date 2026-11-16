'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, useCallback } from 'react'

// ── Music theory helpers ───────────────────────────────────────────────────────

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const WHITE_PCS = new Set([0,2,4,5,7,9,11])

function midiToFreq(m: number) { return 440 * 2 ** ((m - 69) / 12) }
function freqToMidi(f: number) { return 69 + 12 * Math.log2(f / 440) }

function noteOf(midi: number) {
  const pc = ((midi % 12) + 12) % 12
  return { name: NOTES[pc], octave: Math.floor(midi / 12) - 1, isBlack: !WHITE_PCS.has(pc), pc }
}

type PitchInfo = { midi: number; name: string; octave: number; cents: number; freq: number }

function pitchOf(freq: number): PitchInfo {
  const mf   = freqToMidi(freq)
  const midi = Math.round(mf)
  const { name, octave } = noteOf(midi)
  return { midi, name, octave, cents: Math.round((mf - midi) * 100), freq }
}

// ── ACF2+ pitch detection ──────────────────────────────────────────────────────

function detectPitch(buf: Float32Array, sr: number): number {
  let ss = 0
  for (const v of buf) ss += v * v
  if (Math.sqrt(ss / buf.length) < 0.008) return -1  // silence

  const minLag = Math.floor(sr / 1500)   // ~1500 Hz max
  const maxLag = Math.ceil(sr / 50)      // ~50 Hz min
  const n = buf.length

  // Autocorrelation over lag range
  let bestLag = -1, bestVal = -Infinity
  const corrs: number[] = []
  for (let lag = minLag; lag <= Math.min(maxLag, n - 1); lag++) {
    let c = 0
    for (let j = 0; j < n - lag; j++) c += buf[j] * buf[j + lag]
    corrs.push(c)
    if (c > bestVal) { bestVal = c; bestLag = lag }
  }

  if (bestLag < 0 || bestVal < 0) return -1

  // Parabolic interpolation for sub-sample accuracy
  const idx = bestLag - minLag
  if (idx > 0 && idx < corrs.length - 1) {
    const x1 = corrs[idx - 1], x2 = corrs[idx], x3 = corrs[idx + 1]
    const a = (x1 + x3 - 2 * x2) / 2
    const b = (x3 - x1) / 2
    if (a < 0) bestLag = bestLag - b / (2 * a)
  }

  const freq = sr / bestLag
  return freq > 40 && freq < 2000 ? freq : -1
}

// ── Piano synth ───────────────────────────────────────────────────────────────

function playSynth(midi: number, ctx: AudioContext, dur = 1.6) {
  const f = midiToFreq(midi), t = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(0, t)
  master.gain.linearRampToValueAtTime(0.55, t + 0.008)
  master.gain.setTargetAtTime(0.001, t + 0.08, 0.35)
  master.connect(ctx.destination)
  ;([
    [1, 0.65, 'triangle'],
    [2, 0.18, 'sine'],
    [3, 0.07, 'sine'],
    [4, 0.03, 'sine'],
  ] as [number, number, OscillatorType][]).forEach(([mult, gain, type]) => {
    const osc = ctx.createOscillator()
    const g   = ctx.createGain()
    osc.frequency.value = f * mult
    osc.type = type
    g.gain.value = gain
    osc.connect(g); g.connect(master)
    osc.start(t); osc.stop(t + dur + 0.2)
  })
}

function playDing(ctx: AudioContext) {
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g   = ctx.createGain()
  osc.frequency.value = 1047  // C6 ding
  osc.type = 'sine'
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.3, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
  osc.connect(g); g.connect(ctx.destination)
  osc.start(t); osc.stop(t + 0.7)
}

// ── Scale definitions ─────────────────────────────────────────────────────────

const SCALES: Record<string, { name: string; intervals: number[] }> = {
  major:    { name: 'Major',           intervals: [0,2,4,5,7,9,11,12] },
  minor:    { name: 'Natural Minor',   intervals: [0,2,3,5,7,8,10,12] },
  harmMin:  { name: 'Harmonic Minor',  intervals: [0,2,3,5,7,8,11,12] },
  penta:    { name: 'Maj Pentatonic',  intervals: [0,2,4,7,9,12] },
  pentaMin: { name: 'Min Pentatonic',  intervals: [0,3,5,7,10,12] },
}

const ROOT_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

// ── Keyboard layout constants ─────────────────────────────────────────────────

const WW = 36   // white key width px
const WH = 120  // white key height px
const BW = 22   // black key width px
const BH = 74   // black key height px

const LOW_MIDI  = 48  // C3
const HIGH_MIDI = 83  // B5

// Within-octave left offset of each black key (pitch class → px from octave start)
const BLACK_PC_OFFSET: Record<number, number> = {
  1:  Math.round(0.65 * WW - BW / 2),  // C#
  3:  Math.round(1.65 * WW - BW / 2),  // D#
  6:  Math.round(3.65 * WW - BW / 2),  // F#
  8:  Math.round(4.65 * WW - BW / 2),  // G#
  10: Math.round(5.65 * WW - BW / 2),  // A#
}

function whiteKeysBefore(midi: number): number {
  let count = 0
  for (let m = LOW_MIDI; m < midi; m++) {
    if (WHITE_PCS.has(((m % 12) + 12) % 12)) count++
  }
  return count
}

function keyLeft(midi: number): number {
  const pc = ((midi % 12) + 12) % 12
  if (WHITE_PCS.has(pc)) return whiteKeysBefore(midi) * WW
  const octaveC = midi - pc
  return whiteKeysBefore(octaveC) * WW + (BLACK_PC_OFFSET[pc] ?? 0)
}

// ── PitchMeter ────────────────────────────────────────────────────────────────

function PitchMeter({
  pitch, volume, targetMidi, tolerance, matchProgress,
}: {
  pitch: PitchInfo | null
  volume: number
  targetMidi: number | null
  tolerance: number
  matchProgress: number
}) {
  const isMatch = !!(
    pitch && targetMidi !== null &&
    pitch.midi === targetMidi && Math.abs(pitch.cents) <= tolerance
  )
  const cents = pitch?.cents ?? 0
  const barPct = Math.max(0, Math.min(100, ((cents + 50) / 100) * 100))

  const centsColor =
    !pitch   ? 'text-gray-700' :
    isMatch  ? 'text-emerald-400' :
    Math.abs(cents) <= tolerance ? 'text-emerald-400' :
    Math.abs(cents) <= 35       ? 'text-amber-400' :
                                  'text-red-400'

  // Match progress ring
  const R   = 44
  const C   = 2 * Math.PI * R
  const off = C * (1 - matchProgress)

  return (
    <div className="bg-gray-950 text-white rounded-2xl p-5 flex flex-col items-center gap-3 min-w-[200px]">
      {/* Note name + match ring */}
      <div className="relative flex items-center justify-center" style={{ width: 100, height: 100 }}>
        {matchProgress > 0 && (
          <svg className="absolute inset-0" width={100} height={100}>
            <circle cx={50} cy={50} r={R} fill="none" stroke="#1f2937" strokeWidth={5} />
            <circle
              cx={50} cy={50} r={R} fill="none"
              stroke={isMatch ? '#10b981' : '#6366f1'}
              strokeWidth={5}
              strokeDasharray={C}
              strokeDashoffset={off}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 0.08s linear' }}
            />
          </svg>
        )}
        <div className="text-center z-10">
          <span className={`text-4xl font-bold leading-none transition-colors ${isMatch ? 'text-emerald-400' : pitch ? 'text-white' : 'text-gray-700'}`}>
            {pitch ? pitch.name : '—'}
          </span>
          {pitch && (
            <div className="text-sm text-gray-400 leading-none mt-0.5">{pitch.octave}</div>
          )}
        </div>
      </div>

      {/* Hz */}
      <div className="text-xs text-gray-600 font-mono h-3">
        {pitch ? `${pitch.freq.toFixed(1)} Hz` : ''}
      </div>

      {/* Cents tuner bar */}
      <div className="w-full">
        <div className="relative h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
          <div
            className="absolute top-0 bottom-0 bg-emerald-900/50 rounded-full"
            style={{ left: `${50 - tolerance}%`, width: `${tolerance * 2}%` }}
          />
          {pitch && (
            <div
              className={`absolute top-0.5 bottom-0.5 w-2.5 rounded-full transition-all duration-75 ${isMatch ? 'bg-emerald-400' : 'bg-white'}`}
              style={{ left: `calc(${barPct}% - 5px)` }}
            />
          )}
        </div>
        <div className="flex justify-between text-[10px] text-gray-700 mt-0.5 font-mono">
          <span>−50¢</span>
          <span className={`${centsColor} font-semibold`}>
            {pitch ? (cents >= 0 ? `+${cents}¢` : `${cents}¢`) : '0¢'}
          </span>
          <span>+50¢</span>
        </div>
      </div>

      {/* Volume bar */}
      <div className="w-full">
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-75"
            style={{ width: `${Math.min(100, volume * 300)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

// ── PianoKeyboard ─────────────────────────────────────────────────────────────

function PianoKeyboard({
  targetMidi, detectedMidi, onKeyClick,
}: {
  targetMidi?: number | null
  detectedMidi?: number | null
  onKeyClick: (midi: number) => void
}) {
  const keys: { midi: number; isBlack: boolean; left: number; name: string; octave: number }[] = []
  for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) {
    const { name, octave, isBlack } = noteOf(m)
    keys.push({ midi: m, isBlack, left: keyLeft(m), name, octave })
  }

  const whiteKeys = keys.filter(k => !k.isBlack)
  const blackKeys = keys.filter(k =>  k.isBlack)
  const totalW    = whiteKeys.length * WW

  function keyColor(midi: number, isBlack: boolean) {
    const isTarget   = midi === targetMidi
    const isDetected = midi === detectedMidi
    if (isBlack) {
      if (isTarget && isDetected) return 'bg-emerald-500'
      if (isTarget)   return 'bg-amber-400'
      if (isDetected) return 'bg-emerald-500'
      return 'bg-gray-900 hover:bg-gray-700 active:bg-gray-600'
    } else {
      if (isTarget && isDetected) return 'bg-emerald-300'
      if (isTarget)   return 'bg-amber-200'
      if (isDetected) return 'bg-emerald-300'
      return 'bg-white hover:bg-gray-50 active:bg-gray-100'
    }
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative mx-auto" style={{ width: totalW, height: WH + 4 }}>
        {/* White keys */}
        {whiteKeys.map(k => (
          <button
            key={k.midi}
            onMouseDown={() => onKeyClick(k.midi)}
            onTouchStart={(e) => { e.preventDefault(); onKeyClick(k.midi) }}
            className={`absolute border border-gray-300 rounded-b-md transition-colors ${keyColor(k.midi, false)}`}
            style={{ left: k.left, top: 0, width: WW - 1, height: WH }}
          >
            {k.name === 'C' && (
              <span className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-gray-400 select-none pointer-events-none">
                C{k.octave}
              </span>
            )}
          </button>
        ))}
        {/* Black keys */}
        {blackKeys.map(k => (
          <button
            key={k.midi}
            onMouseDown={() => onKeyClick(k.midi)}
            onTouchStart={(e) => { e.preventDefault(); onKeyClick(k.midi) }}
            className={`absolute rounded-b-sm transition-colors ${keyColor(k.midi, true)}`}
            style={{ left: k.left, top: 0, width: BW, height: BH, zIndex: 10 }}
          />
        ))}
      </div>
    </div>
  )
}

// ── PitchContour ──────────────────────────────────────────────────────────────
// Rolling pitch-history graph. Y-axis = MIDI semitones centred on target.
// Amber dashed line = target. Green / amber / grey line = your pitch trajectory.

const HISTORY_MS  = 6000
const SAMPLE_HZ   = 20   // samples per second
const CONTOUR_HALF = 7   // ±7 semitones visible on y-axis

function PitchContour({
  pitch,
  targetMidi,
  tolerance,
}: {
  pitch:       PitchInfo | null
  targetMidi:  number | null
  tolerance:   number          // cents
}) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const historyRef = useRef<({ t: number; fmidi: number } | null)[]>([])

  // Stable refs so the RAF loop always sees fresh values
  const pitchRef   = useRef(pitch)
  const targetRef  = useRef(targetMidi)
  const tolRef     = useRef(tolerance)
  useEffect(() => { pitchRef.current  = pitch       }, [pitch])
  useEffect(() => { targetRef.current = targetMidi  }, [targetMidi])
  useEffect(() => { tolRef.current    = tolerance   }, [tolerance])

  // ── Sample loop (fixed rate, independent of renders) ──
  useEffect(() => {
    const id = setInterval(() => {
      const p   = pitchRef.current
      const now = Date.now()
      historyRef.current.push(p ? { t: now, fmidi: p.midi + p.cents / 100 } : null)
      // Trim entries older than window + buffer
      const cutoff = now - HISTORY_MS - 300
      while (historyRef.current.length > 0) {
        const first = historyRef.current[0]
        if (first === null || first.t < cutoff) historyRef.current.shift()
        else break
      }
    }, Math.round(1000 / SAMPLE_HZ))
    return () => clearInterval(id)
  }, [])

  // ── Canvas draw loop ───────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let raf: number
    const dpr = window.devicePixelRatio || 1

    function setSize() {
      const r = canvas!.getBoundingClientRect()
      if (r.width === 0) return
      canvas!.width  = Math.floor(r.width  * dpr)
      canvas!.height = Math.floor(r.height * dpr)
    }
    setSize()
    const ro = new ResizeObserver(setSize)
    ro.observe(canvas)

    function draw() {
      const ctx = canvas!.getContext('2d')
      if (!ctx || canvas!.width === 0) { raf = requestAnimationFrame(draw); return }

      const W   = canvas!.width  / dpr
      const H   = canvas!.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const now     = Date.now()
      const history = historyRef.current
      const tgt     = targetRef.current
      const tol     = tolRef.current

      const PAD_L = 26  // left margin for note labels

      // Y axis: centre on target (or C4 fallback) ± CONTOUR_HALF semitones
      const center = tgt ?? 60
      const yMin   = center - CONTOUR_HALF
      const yMax   = center + CONTOUR_HALF
      const midiToY = (m: number) => H - ((m - yMin) / (yMax - yMin)) * H

      // ── Background ──
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, W, H)

      // ── Note grid lines + labels ──
      for (let m = Math.ceil(yMin); m <= Math.floor(yMax); m++) {
        const y = midiToY(m)
        const { name, octave, isBlack } = noteOf(m)
        ctx.strokeStyle = isBlack ? '#1e293b' : '#1e3a5f'
        ctx.lineWidth   = isBlack ? 0.5 : 1
        ctx.setLineDash([])
        ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W, y); ctx.stroke()
        if (!isBlack) {
          ctx.fillStyle = m === tgt ? '#f59e0b' : '#334155'
          ctx.font = `${9}px monospace`
          ctx.fillText(name === 'C' ? `C${octave}` : name, 2, y + 3)
        }
      }

      // ── Tolerance band ──
      if (tgt !== null) {
        const tolSemi = tol / 100
        const topY = midiToY(tgt + tolSemi)
        const botY = midiToY(tgt - tolSemi)
        ctx.fillStyle = 'rgba(16,185,129,0.09)'
        ctx.fillRect(PAD_L, topY, W - PAD_L, botY - topY)
      }

      // ── Target line ──
      if (tgt !== null) {
        const y = midiToY(tgt)
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth   = 1.5
        ctx.setLineDash([7, 3])
        ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - 36, y); ctx.stroke()
        ctx.setLineDash([])
        // Label
        const { name, octave } = noteOf(tgt)
        ctx.fillStyle  = '#f59e0b'
        ctx.font       = 'bold 10px sans-serif'
        ctx.textAlign  = 'right'
        ctx.fillText(`${name}${octave}`, W - 2, y - 3)
        ctx.textAlign  = 'left'
      }

      // ── Pitch history line ──
      let px: number | null = null
      let py: number | null = null
      for (const s of history) {
        if (!s) { px = py = null; continue }
        const age = now - s.t
        if (age > HISTORY_MS) { px = py = null; continue }
        const x       = PAD_L + (W - PAD_L) * (1 - age / HISTORY_MS)
        const clamped = Math.max(yMin, Math.min(yMax, s.fmidi))
        const y       = midiToY(clamped)
        if (px !== null && py !== null) {
          const dist = tgt !== null ? Math.abs(s.fmidi - tgt) : Infinity
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(x, y)
          ctx.strokeStyle = dist <= tol / 100 ? '#10b981'
                          : dist <= 1.5       ? '#f59e0b'
                          :                    '#94a3b8'
          ctx.lineWidth   = 2
          ctx.setLineDash([])
          ctx.stroke()
        }
        px = x; py = y
      }

      // ── Leading dot ──
      const latest = [...history].reverse().find(s => s !== null)
      if (latest && now - latest.t < 400) {
        const age     = now - latest.t
        const x       = PAD_L + (W - PAD_L) * (1 - age / HISTORY_MS)
        const clamped = Math.max(yMin, Math.min(yMax, latest.fmidi))
        const y       = midiToY(clamped)
        const inTol   = tgt !== null && Math.abs(latest.fmidi - tgt) <= tol / 100
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fillStyle = inTol ? '#10b981' : '#f1f5f9'
        ctx.fill()

        // Distance label next to dot
        if (tgt !== null) {
          const diff = latest.fmidi - tgt
          const arrow = diff >  tol / 100 ? '▲' : diff < -tol / 100 ? '▼' : '✓'
          const label = Math.abs(diff) <= tol / 100
            ? 'in tune'
            : `${arrow} ${Math.abs(diff).toFixed(1)} st`
          ctx.fillStyle  = inTol ? '#10b981' : '#cbd5e1'
          ctx.font       = '10px sans-serif'
          ctx.textAlign  = 'left'
          ctx.fillText(label, Math.min(x + 8, W - 60), y + 4)
          ctx.textAlign  = 'left'
        }
      }

      // ── Time tick marks ──
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth   = 0.5
      for (let sec = 1; sec <= 5; sec++) {
        const x = PAD_L + (W - PAD_L) * (1 - (sec * 1000) / HISTORY_MS)
        ctx.beginPath(); ctx.moveTo(x, H - 10); ctx.lineTo(x, H); ctx.stroke()
        ctx.fillStyle  = '#334155'
        ctx.font       = '8px monospace'
        ctx.textAlign  = 'center'
        ctx.fillText(`-${sec}s`, x, H - 12)
      }
      ctx.textAlign = 'left'

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, []) // empty deps — all live data via refs

  return (
    <div className="relative bg-gray-950 rounded-xl overflow-hidden" style={{ height: 180 }}>
      <canvas ref={canvasRef} className="w-full h-full block" />
      {/* Static label */}
      <div className="absolute top-2 right-2 text-[9px] text-slate-600 font-mono select-none pointer-events-none">
        pitch contour · 6s
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Mode = 'freeplay' | 'match' | 'scale'

export function PianoTrainer() {
  const [mode, setMode] = useState<Mode>('freeplay')

  // Audio
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const rafRef       = useRef<number | null>(null)
  const frameRef     = useRef(0)

  const [micActive, setMicActive] = useState(false)
  const [micError,  setMicError]  = useState('')

  // Pitch state
  const [pitch,     setPitch]  = useState<PitchInfo | null>(null)
  const [volume,    setVolume] = useState(0)
  const pitchRef  = useRef<PitchInfo | null>(null)   // for RAF callbacks

  // Match tracking (done in RAF to avoid stale closure issues)
  const matchStartRef  = useRef<number | null>(null)
  const matchFiredRef  = useRef(false)
  const [matchProgress, setMatchProgress] = useState(0)
  const [justMatched,   setJustMatched]   = useState(false)

  // Settings
  const [tolerance, setTolerance] = useState(20)  // cents
  const [holdMs,    setHoldMs]    = useState(500)  // ms
  const toleranceRef = useRef(20)
  const holdMsRef    = useRef(500)
  useEffect(() => { toleranceRef.current = tolerance }, [tolerance])
  useEffect(() => { holdMsRef.current = holdMs }, [holdMs])

  // Note match mode
  const [targetMidi, setTargetMidi] = useState<number>(60)  // C4
  const targetMidiRef = useRef<number>(60)
  const [score, setScore] = useState({ hits: 0, total: 0 })

  // Scale trainer
  const [scaleRoot,    setScaleRoot]    = useState('C')
  const [scaleOctave,  setScaleOctave]  = useState(4)
  const [scaleKey,     setScaleKey]     = useState('major')
  const [scaleNotes,   setScaleNotes]   = useState<number[]>([])
  const [scaleIdx,     setScaleIdx]     = useState(0)
  const scaleNotesRef = useRef<number[]>([])
  const scaleIdxRef   = useRef(0)

  const modeRef = useRef<Mode>('freeplay')

  // Sync refs
  useEffect(() => { targetMidiRef.current = targetMidi }, [targetMidi])
  useEffect(() => { modeRef.current = mode; resetMatch() }, [mode])
  useEffect(() => { scaleNotesRef.current = scaleNotes }, [scaleNotes])
  useEffect(() => { scaleIdxRef.current   = scaleIdx   }, [scaleIdx])

  // ── Build scale notes ────────────────────────────────────────────────────

  useEffect(() => {
    const rootPc    = ROOT_NAMES.indexOf(scaleRoot)
    const rootMidi  = (scaleOctave + 1) * 12 + rootPc
    const intervals = SCALES[scaleKey]?.intervals ?? []
    const notes     = intervals.map(i => rootMidi + i)
    setScaleNotes(notes)
    setScaleIdx(0)
  }, [scaleRoot, scaleOctave, scaleKey])

  // Scale target: always the current scale note
  const scaleTargetMidi = scaleNotes[scaleIdx] ?? null

  // Effective target based on mode
  const effectiveTarget =
    mode === 'match' ? targetMidi :
    mode === 'scale' ? scaleTargetMidi :
    null

  const effectiveTargetRef = useRef<number | null>(null)
  useEffect(() => { effectiveTargetRef.current = effectiveTarget }, [effectiveTarget])

  // ── Match handling ────────────────────────────────────────────────────────

  function resetMatch() {
    matchStartRef.current = null
    matchFiredRef.current = false
    setMatchProgress(0)
  }

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
    return audioCtxRef.current
  }, [])

  function onMatchSuccess() {
    if (matchFiredRef.current) return
    matchFiredRef.current = true

    playDing(getAudioCtx())
    setJustMatched(true)
    setMatchProgress(0)

    if (modeRef.current === 'match') {
      setScore(s => ({ hits: s.hits + 1, total: s.total + 1 }))
      setTimeout(() => {
        setJustMatched(false)
        const next = randomVocalNote()
        setTargetMidi(next)
        targetMidiRef.current = next
        matchFiredRef.current = false
        resetMatch()
      }, 700)
    } else if (modeRef.current === 'scale') {
      setTimeout(() => {
        setJustMatched(false)
        const notes  = scaleNotesRef.current
        const curIdx = scaleIdxRef.current
        const next   = curIdx + 1
        if (next >= notes.length) {
          setScaleIdx(0)
          scaleIdxRef.current = 0
        } else {
          setScaleIdx(next)
          scaleIdxRef.current = next
        }
        matchFiredRef.current = false
        resetMatch()
      }, 600)
    }
  }

  function randomVocalNote(): number {
    // Range: C3-B4 (48-71) — comfortable singing range
    const white: number[] = []
    for (let m = 48; m <= 71; m++) {
      if (WHITE_PCS.has(((m % 12) + 12) % 12)) white.push(m)
    }
    return white[Math.floor(Math.random() * white.length)]
  }

  // ── Pitch detection RAF loop ──────────────────────────────────────────────

  const onMatchRef = useRef<() => void>(onMatchSuccess)
  useEffect(() => { onMatchRef.current = onMatchSuccess })

  const startPitchLoop = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const buf = new Float32Array(analyser.fftSize)

    function tick() {
      const a = analyserRef.current
      if (!a) return
      a.getFloatTimeDomainData(buf)

      // Volume (RMS)
      let ss = 0
      for (const v of buf) ss += v * v
      const rms = Math.sqrt(ss / buf.length)
      setVolume(rms)

      frameRef.current++
      if (frameRef.current % 2 === 0) {
        const freq = detectPitch(buf, a.context.sampleRate)

        if (freq > 0) {
          const p = pitchOf(freq)
          setPitch(p)
          pitchRef.current = p

          // Match tracking
          const tgt = effectiveTargetRef.current
          if (tgt !== null && modeRef.current !== 'freeplay') {
            const ok = p.midi === tgt && Math.abs(p.cents) <= toleranceRef.current
            if (ok) {
              if (matchStartRef.current === null) matchStartRef.current = performance.now()
              const progress = Math.min(1, (performance.now() - matchStartRef.current) / holdMsRef.current)
              setMatchProgress(progress)
              if (progress >= 1) onMatchRef.current()
            } else {
              matchStartRef.current = null
              matchFiredRef.current = false
              setMatchProgress(0)
            }
          }
        } else {
          setPitch(null)
          pitchRef.current = null
          matchStartRef.current = null
          matchFiredRef.current = false
          setMatchProgress(0)
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // ── Mic toggle ────────────────────────────────────────────────────────────

  async function toggleMic() {
    if (micActive) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      micStreamRef.current?.getTracks().forEach(t => t.stop())
      micStreamRef.current = null
      analyserRef.current  = null
      setMicActive(false)
      setPitch(null)
      setVolume(0)
      return
    }
    setMicError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      micStreamRef.current = stream
      const ctx      = getAudioCtx()
      const analyser = ctx.createAnalyser()
      analyser.fftSize         = 2048
      analyser.smoothingTimeConstant = 0.2
      analyserRef.current = analyser
      const src = ctx.createMediaStreamSource(stream)
      src.connect(analyser)
      setMicActive(true)
      startPitchLoop()
    } catch {
      setMicError('Microphone access denied')
    }
  }

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    micStreamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  // ── Key press ─────────────────────────────────────────────────────────────

  function handleKeyClick(midi: number) {
    playSynth(midi, getAudioCtx())
  }

  // ── New random target ─────────────────────────────────────────────────────

  function newTarget() {
    const next = randomVocalNote()
    setTargetMidi(next)
    targetMidiRef.current = next
    resetMatch()
    setScore(s => s.total > 0 ? { ...s, total: s.total + 1 } : s)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const MODES: { id: Mode; icon: string; label: string }[] = [
    { id: 'freeplay', icon: '🎹', label: 'Free Play'    },
    { id: 'match',    icon: '🎯', label: 'Note Match'   },
    { id: 'scale',    icon: '🎵', label: 'Scale Trainer' },
  ]

  const detectedMidi = pitch?.midi ?? null

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Piano &amp; Voice Trainer</h1>
          <p className="text-xs text-gray-500 mt-0.5">Sing or play — pitch detection with real-time feedback</p>
        </div>
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Home</Link>
      </div>

      {/* Mode tabs */}
      <div className="flex border-b border-gray-200 bg-white">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              mode === m.id
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 px-6 py-6 max-w-5xl mx-auto w-full">

        {/* Left: pitch meter + mic */}
        <div className="flex flex-col gap-4 lg:w-56 shrink-0">
          <PitchMeter
            pitch={pitch}
            volume={volume}
            targetMidi={effectiveTarget}
            tolerance={tolerance}
            matchProgress={matchProgress}
          />

          {justMatched && (
            <div className="text-center text-emerald-600 font-semibold text-sm animate-bounce">
              ✓ Matched!
            </div>
          )}

          <button
            onClick={toggleMic}
            className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-colors ${
              micActive
                ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {micActive ? '⏹ Stop Mic' : '🎙 Start Mic'}
          </button>
          {micError && <p className="text-xs text-red-500 text-center">{micError}</p>}

          {/* Settings */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-col gap-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tuner settings</p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tolerance</label>
              <div className="flex gap-1">
                {[10, 20, 30].map(v => (
                  <button
                    key={v}
                    onClick={() => setTolerance(v)}
                    className={`flex-1 py-1 text-xs rounded-lg font-medium transition-colors ${
                      tolerance === v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    ±{v}¢
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Hold time</label>
              <div className="flex gap-1">
                {[300, 500, 1000].map(v => (
                  <button
                    key={v}
                    onClick={() => setHoldMs(v)}
                    className={`flex-1 py-1 text-xs rounded-lg font-medium transition-colors ${
                      holdMs === v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {v}ms
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: mode panel */}
        <div className="flex-1 flex flex-col gap-4">

          {/* ── Free Play ── */}
          {mode === 'freeplay' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-2">Free Play</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Click any key to hear it. Enable the microphone to see your singing pitch
                highlighted live on the keyboard in <span className="text-emerald-600 font-medium">green</span>.
              </p>
              {pitch && (
                <p className="mt-3 text-sm font-medium text-indigo-700">
                  Detected: <strong>{pitch.name}{pitch.octave}</strong> ({pitch.freq.toFixed(1)} Hz, {pitch.cents >= 0 ? '+' : ''}{pitch.cents}¢)
                </p>
              )}
            </div>
          )}

          {/* ── Note Match ── */}
          {mode === 'match' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800">Note Match</h2>
                <span className="text-sm font-mono text-gray-500">
                  {score.hits} / {score.total}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-1">Target</div>
                  <div className={`text-5xl font-bold transition-colors ${justMatched ? 'text-emerald-500' : 'text-gray-900'}`}>
                    {noteOf(targetMidi).name}
                    <span className="text-2xl text-gray-400">{noteOf(targetMidi).octave}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{midiToFreq(targetMidi).toFixed(1)} Hz</div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => playSynth(targetMidi, getAudioCtx())}
                    className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors"
                  >
                    ▶ Hear it
                  </button>
                  <button
                    onClick={newTarget}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    ↻ New note
                  </button>
                </div>
              </div>

              <p className="text-sm text-gray-500">
                Sing the target note. The progress ring in the pitch meter fills as you hold it steady within ±{tolerance}¢.
              </p>

              {!micActive && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  Enable the microphone to start matching.
                </p>
              )}
            </div>
          )}

          {/* ── Scale Trainer ── */}
          {mode === 'scale' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-4">
              <h2 className="font-semibold text-gray-800">Scale Trainer</h2>

              {/* Scale settings */}
              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Root</label>
                  <select
                    value={scaleRoot}
                    onChange={e => setScaleRoot(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {ROOT_NAMES.map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Octave</label>
                  <select
                    value={scaleOctave}
                    onChange={e => setScaleOctave(Number(e.target.value))}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {[2,3,4].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Scale</label>
                  <select
                    value={scaleKey}
                    onChange={e => setScaleKey(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {Object.entries(SCALES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Scale progress */}
              {scaleNotes.length > 0 && scaleTargetMidi !== null && (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="text-center">
                      <div className="text-xs text-gray-400 mb-1">Sing next</div>
                      <div className={`text-4xl font-bold transition-colors ${justMatched ? 'text-emerald-500' : 'text-gray-900'}`}>
                        {noteOf(scaleTargetMidi).name}
                        <span className="text-xl text-gray-400">{noteOf(scaleTargetMidi).octave}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => playSynth(scaleTargetMidi, getAudioCtx())}
                      className="px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors"
                    >
                      ▶ Hear it
                    </button>
                    <button
                      onClick={() => { setScaleIdx(0); resetMatch() }}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                    >
                      ↺ Restart
                    </button>
                  </div>

                  {/* Scale dots */}
                  <div className="flex gap-1.5 flex-wrap">
                    {scaleNotes.map((m, i) => {
                      const { name, octave } = noteOf(m)
                      return (
                        <div
                          key={i}
                          className={`flex flex-col items-center px-2 py-1 rounded-lg text-xs transition-colors ${
                            i === scaleIdx
                              ? 'bg-amber-200 text-amber-900 font-bold ring-1 ring-amber-400'
                              : i < scaleIdx
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          <span>{name}</span>
                          <span className="text-[9px]">{octave}</span>
                        </div>
                      )
                    })}
                  </div>

                  <p className="text-xs text-gray-400 mt-2">
                    Note {scaleIdx + 1} of {scaleNotes.length}
                  </p>
                </div>
              )}

              {!micActive && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  Enable the microphone to start matching.
                </p>
              )}
            </div>
          )}

          {/* Play whole scale button */}
          {mode === 'scale' && scaleNotes.length > 0 && (
            <button
              onClick={async () => {
                const ctx = getAudioCtx()
                let delay = 0
                for (const m of scaleNotes) {
                  await new Promise<void>(r => setTimeout(() => { playSynth(m, ctx, 0.8); r() }, delay))
                  delay += 700
                }
              }}
              className="bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl py-2.5 text-sm font-medium transition-colors"
            >
              ▶ Play full scale
            </button>
          )}
        </div>
      </div>

      {/* Pitch contour */}
      <div className="px-6 pb-2">
        <PitchContour
          pitch={pitch}
          targetMidi={effectiveTarget}
          tolerance={tolerance}
        />
      </div>

      {/* Keyboard */}
      <div className="bg-white border-t border-gray-200 px-4 py-5">
        <PianoKeyboard
          targetMidi={effectiveTarget}
          detectedMidi={detectedMidi}
          onKeyClick={handleKeyClick}
        />
        <p className="text-center text-xs text-gray-400 mt-2">
          C3 – B5 · Click to play · <span className="text-amber-600">Amber = target</span> · <span className="text-emerald-600">Green = your pitch</span>
        </p>
      </div>

    </div>
  )
}
