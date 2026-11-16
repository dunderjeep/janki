'use client'

import { useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Technique = 'wim-hof' | 'box' | '4-7-8' | 'coherent' | 'physiological-sigh'

interface SessionConfig {
  id: string
  name: string
  technique: Technique
  rounds: number
  // Wim Hof
  breathCount: number    // breaths per round
  breathPace: number     // seconds total per breath cycle (inhale + exhale)
  holdDuration: number   // retention hold after exhale (seconds)
  recoveryHold: number   // recovery hold after inhale (seconds)
  // Timed techniques
  inhaleDuration: number
  holdInhale: number
  exhaleDuration: number
  holdExhale: number
  // Audio
  heartbeatOn: boolean
  heartbeatBpm: number
  bowlOn: boolean
  guideToneOn: boolean
  binauralOn: boolean
  binauralBeat: number
  binauralCarrier: number
  binauralVol: number
}

interface PhaseEntry {
  id: string
  label: string        // e.g. "Round 2/3"
  subLabel: string     // e.g. "Breath 15/30"
  action: string       // short action word: "IN" | "OUT" | "HOLD" | "REST"
  instruction: string  // full instruction text
  duration: number     // seconds (may be fractional)
  circleScale: number  // 0.55–1.4
  easing: string       // CSS timing function
  bowl: boolean        // trigger bowl sound on phase start
  guideDir: 'up' | 'down' | 'hold' | 'none'
  color: string        // indigo | violet | teal | sky | slate
  isHold: boolean      // show countdown prominently
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants & defaults
// ─────────────────────────────────────────────────────────────────────────────

const TECHNIQUE_META: Record<Technique, { label: string; desc: string }> = {
  'wim-hof':             { label: 'Wim Hof',             desc: '30+ power breaths → retention hold → recovery. Repeat.' },
  'box':                 { label: 'Box Breathing',        desc: 'Inhale · Hold · Exhale · Hold — equal durations.' },
  '4-7-8':               { label: '4-7-8',               desc: 'Inhale 4s → Hold 7s → Exhale 8s. Dr. Weil relaxation.' },
  'coherent':            { label: 'Coherent Breathing',   desc: '5.5s in → 5.5s out. Maximise heart rate variability.' },
  'physiological-sigh':  { label: 'Physiological Sigh',   desc: 'Double-inhale → long slow exhale. Fast stress relief.' },
}

const PHASE_COLORS: Record<string, { circle: string; arc: string; textClass: string }> = {
  indigo: { circle: '#818cf8', arc: '#6366f1', textClass: 'text-indigo-600' },
  violet: { circle: '#a78bfa', arc: '#7c3aed', textClass: 'text-violet-600' },
  teal:   { circle: '#2dd4bf', arc: '#0d9488', textClass: 'text-teal-600'   },
  sky:    { circle: '#38bdf8', arc: '#0284c7', textClass: 'text-sky-600'    },
  slate:  { circle: '#94a3b8', arc: '#64748b', textClass: 'text-slate-500'  },
}

const STORAGE_KEY = 'janki-breath-sessions'

const DEFAULTS: SessionConfig[] = [
  {
    id: 'wim-hof-standard',
    name: 'Wim Hof — Standard',
    technique: 'wim-hof',
    rounds: 3, breathCount: 30, breathPace: 3,
    holdDuration: 90, recoveryHold: 15,
    inhaleDuration: 4, holdInhale: 0, exhaleDuration: 4, holdExhale: 0,
    heartbeatOn: true, heartbeatBpm: 60,
    bowlOn: true, guideToneOn: false,
    binauralOn: false, binauralBeat: 6, binauralCarrier: 180, binauralVol: 0.2,
  },
  {
    id: 'box-4x4',
    name: 'Box Breathing 4×4',
    technique: 'box',
    rounds: 8, breathCount: 30, breathPace: 4,
    holdDuration: 60, recoveryHold: 15,
    inhaleDuration: 4, holdInhale: 4, exhaleDuration: 4, holdExhale: 4,
    heartbeatOn: false, heartbeatBpm: 60,
    bowlOn: true, guideToneOn: true,
    binauralOn: true, binauralBeat: 10, binauralCarrier: 200, binauralVol: 0.2,
  },
  {
    id: '4-7-8-classic',
    name: '4-7-8 Breath',
    technique: '4-7-8',
    rounds: 4, breathCount: 30, breathPace: 4,
    holdDuration: 60, recoveryHold: 15,
    inhaleDuration: 4, holdInhale: 7, exhaleDuration: 8, holdExhale: 0,
    heartbeatOn: false, heartbeatBpm: 60,
    bowlOn: true, guideToneOn: true,
    binauralOn: true, binauralBeat: 6, binauralCarrier: 180, binauralVol: 0.2,
  },
  {
    id: 'physiological-sigh-quick',
    name: 'Physiological Sigh',
    technique: 'physiological-sigh',
    rounds: 5, breathCount: 30, breathPace: 4,
    holdDuration: 60, recoveryHold: 15,
    inhaleDuration: 2, holdInhale: 0, exhaleDuration: 6, holdExhale: 0,
    heartbeatOn: false, heartbeatBpm: 60,
    bowlOn: false, guideToneOn: false,
    binauralOn: false, binauralBeat: 10, binauralCarrier: 200, binauralVol: 0.2,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Phase queue builder
// ─────────────────────────────────────────────────────────────────────────────

function buildQueue(c: SessionConfig): PhaseEntry[] {
  const q: PhaseEntry[] = []

  if (c.technique === 'wim-hof') {
    for (let r = 1; r <= c.rounds; r++) {
      const rl = `Round ${r} / ${c.rounds}`
      const half = c.breathPace / 2
      for (let b = 1; b <= c.breathCount; b++) {
        q.push({ id: `r${r}b${b}i`, label: rl, subLabel: `Breath ${b} / ${c.breathCount}`, action: 'IN', instruction: 'Breathe in fully — through nose or mouth', duration: half, circleScale: 1.35, easing: 'ease-in', bowl: false, guideDir: 'up', color: 'indigo', isHold: false })
        q.push({ id: `r${r}b${b}o`, label: rl, subLabel: `Breath ${b} / ${c.breathCount}`, action: 'OUT', instruction: 'Let it go — passive release', duration: half, circleScale: 0.6, easing: 'ease-out', bowl: false, guideDir: 'down', color: 'sky', isHold: false })
      }
      q.push({ id: `r${r}hold`, label: rl, subLabel: 'Retention hold', action: 'HOLD', instruction: 'Exhale and hold — feel the stillness', duration: c.holdDuration, circleScale: 0.55, easing: 'ease-out', bowl: c.bowlOn, guideDir: 'hold', color: 'violet', isHold: true })
      q.push({ id: `r${r}ri`,   label: rl, subLabel: 'Recovery', action: 'IN', instruction: 'Take one full breath in', duration: 3, circleScale: 1.35, easing: 'ease-in', bowl: false, guideDir: 'up', color: 'teal', isHold: false })
      q.push({ id: `r${r}rh`,   label: rl, subLabel: 'Recovery hold', action: 'HOLD', instruction: 'Hold — gently squeeze', duration: c.recoveryHold, circleScale: 1.35, easing: 'linear', bowl: c.bowlOn, guideDir: 'hold', color: 'teal', isHold: true })
      if (r < c.rounds) {
        q.push({ id: `r${r}tr`, label: 'Rest', subLabel: 'Next round soon', action: 'REST', instruction: 'Release — breathe naturally', duration: 5, circleScale: 1.0, easing: 'ease-in-out', bowl: false, guideDir: 'none', color: 'slate', isHold: false })
      }
    }
  } else if (c.technique === 'physiological-sigh') {
    for (let r = 1; r <= c.rounds; r++) {
      const rl = `Cycle ${r} / ${c.rounds}`
      q.push({ id: `r${r}i1`, label: rl, subLabel: 'First inhale', action: 'IN', instruction: 'Inhale — fill the lungs', duration: 2, circleScale: 1.2, easing: 'ease-in', bowl: r === 1 && c.bowlOn, guideDir: 'up', color: 'indigo', isHold: false })
      q.push({ id: `r${r}i2`, label: rl, subLabel: 'Second sniff', action: 'IN+', instruction: 'Sniff again — top up', duration: 1, circleScale: 1.38, easing: 'ease-in', bowl: false, guideDir: 'up', color: 'indigo', isHold: false })
      q.push({ id: `r${r}out`, label: rl, subLabel: 'Exhale', action: 'OUT', instruction: 'Slow full exhale — let everything go', duration: 6, circleScale: 0.6, easing: 'ease-out', bowl: false, guideDir: 'down', color: 'sky', isHold: false })
    }
  } else if (c.technique === 'coherent') {
    for (let r = 1; r <= c.rounds; r++) {
      const rl = `Cycle ${r} / ${c.rounds}`
      q.push({ id: `r${r}in`,  label: rl, subLabel: 'Inhale', action: 'IN',  instruction: 'Inhale steadily', duration: 5.5, circleScale: 1.35, easing: 'ease-in-out', bowl: r === 1 && c.bowlOn, guideDir: 'up',   color: 'indigo', isHold: false })
      q.push({ id: `r${r}out`, label: rl, subLabel: 'Exhale', action: 'OUT', instruction: 'Exhale steadily', duration: 5.5, circleScale: 0.6,  easing: 'ease-in-out', bowl: false, guideDir: 'down', color: 'sky',    isHold: false })
    }
  } else {
    // box or 4-7-8
    for (let r = 1; r <= c.rounds; r++) {
      const rl = `Cycle ${r} / ${c.rounds}`
      q.push({ id: `r${r}in`,  label: rl, subLabel: 'Inhale', action: 'IN',  instruction: c.technique === '4-7-8' ? 'Inhale through nose' : 'Inhale', duration: c.inhaleDuration, circleScale: 1.35, easing: 'ease-in',    bowl: r === 1 && c.bowlOn, guideDir: 'up',   color: 'indigo', isHold: false })
      if (c.holdInhale > 0) q.push({ id: `r${r}hi`, label: rl, subLabel: 'Hold', action: 'HOLD', instruction: 'Hold', duration: c.holdInhale, circleScale: 1.35, easing: 'linear', bowl: false, guideDir: 'hold', color: 'violet', isHold: true })
      q.push({ id: `r${r}out`, label: rl, subLabel: 'Exhale', action: 'OUT', instruction: c.technique === '4-7-8' ? 'Exhale through mouth — whoosh' : 'Exhale', duration: c.exhaleDuration, circleScale: 0.6, easing: 'ease-out', bowl: false, guideDir: 'down', color: 'sky',    isHold: false })
      if (c.holdExhale > 0) q.push({ id: `r${r}he`, label: rl, subLabel: 'Hold empty', action: 'HOLD', instruction: 'Hold empty', duration: c.holdExhale, circleScale: 0.6, easing: 'linear', bowl: false, guideDir: 'hold', color: 'slate', isHold: true })
    }
  }

  return q
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio helpers (module-level, no hooks)
// ─────────────────────────────────────────────────────────────────────────────

function synthHeartbeat(ctx: AudioContext, t: number, vol: number) {
  const thump = (freq: number, at: number, decay: number, amp: number) => {
    const osc = ctx.createOscillator(), g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, at)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.44, at + decay)
    g.gain.setValueAtTime(amp, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + decay + 0.06)
    osc.connect(g).connect(ctx.destination)
    osc.start(at); osc.stop(at + decay + 0.07)
  }
  thump(90, t,        0.14, vol)         // lub
  thump(74, t + 0.17, 0.11, vol * 0.6)  // dub
}

function playBowlSound(ctx: AudioContext, vol: number) {
  // Tibetan-style singing bowl: fundamental + partial harmonics, long decay
  const partials: [number, number, number][] = [
    [220,  vol * 0.50, 4.0],
    [606,  vol * 0.28, 3.0],
    [1189, vol * 0.14, 2.2],
    [1960, vol * 0.07, 1.6],
  ]
  partials.forEach(([freq, amp, decay]) => {
    const osc = ctx.createOscillator(), g = ctx.createGain()
    osc.type = 'sine'; osc.frequency.value = freq
    g.gain.setValueAtTime(amp, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay)
    osc.connect(g).connect(ctx.destination)
    osc.start(); osc.stop(ctx.currentTime + decay + 0.1)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage & utility
// ─────────────────────────────────────────────────────────────────────────────

function loadSessions(): SessionConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as SessionConfig[]
      return parsed.length > 0 ? parsed : [...DEFAULTS]
    }
  } catch {}
  return [...DEFAULTS]
}

function saveSessions(s: SessionConfig[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

function totalMins(c: SessionConfig): string {
  const total = buildQueue(c).reduce((s, p) => s + p.duration, 0)
  return `~${Math.ceil(total / 60)} min`
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SL({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{children}</p>
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} aria-label={label}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors
        ${on ? 'bg-teal-600' : 'bg-gray-200'}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform
        ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

function SliderRow({ label, value, min, max, step = 1, display, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; display: string
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span className="tabular-nums font-medium text-gray-700">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-teal-600" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// WindIcon
// ─────────────────────────────────────────────────────────────────────────────

function WindIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/>
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2"/>
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function BreathPractice() {
  // UI state
  const [open, setOpen]   = useState(false)
  const [view, setView]   = useState<'list' | 'config' | 'run'>('list')
  const [sessions, setSessions] = useState<SessionConfig[]>([])
  const [editing, setEditing]   = useState<SessionConfig | null>(null)

  // Practice display state
  const [phase, setPhase]         = useState<PhaseEntry | null>(null)
  const [timeLeft, setTimeLeft]   = useState(0)
  const [phaseTotal, setPhaseTotal] = useState(0)
  const [progress, setProgress]   = useState(0)
  const [running, setRunning]     = useState(false)
  const [paused, setPaused]       = useState(false)
  const [done, setDone]           = useState(false)
  const [activeSession, setActiveSession] = useState<SessionConfig | null>(null)

  // Timer refs
  const queueRef   = useRef<PhaseEntry[]>([])
  const idxRef     = useRef(0)
  const timeRef    = useRef(0)
  const pausedRef  = useRef(false)
  const tickRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  // Audio refs
  const ctxRef        = useRef<AudioContext | null>(null)
  const hbRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const hbNextRef     = useRef(0)
  const hbBpmRef      = useRef(60)
  const binLeftRef    = useRef<OscillatorNode | null>(null)
  const binRightRef   = useRef<OscillatorNode | null>(null)
  const guideOscRef   = useRef<OscillatorNode | null>(null)
  const guideGainRef  = useRef<GainNode | null>(null)

  // Advance ref avoids stale closure in setInterval
  const advanceRef = useRef<() => void>(() => {})

  useEffect(() => { setSessions(loadSessions()) }, [])

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current)
    teardownAudio()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Audio ──────────────────────────────────────────────────────────────────

  function ac(): AudioContext {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    return ctxRef.current
  }

  function startHeartbeat(bpm: number) {
    if (hbRef.current) return
    const c = ac()
    hbBpmRef.current = bpm; hbNextRef.current = c.currentTime
    function tick() {
      if (!ctxRef.current) return
      while (hbNextRef.current < ctxRef.current.currentTime + 0.1) {
        synthHeartbeat(ctxRef.current, hbNextRef.current, 0.4)
        hbNextRef.current += 60 / hbBpmRef.current
      }
    }
    tick()
    hbRef.current = setInterval(tick, 25)
  }

  function stopHeartbeat() {
    if (hbRef.current) { clearInterval(hbRef.current); hbRef.current = null }
  }

  function startBinaural(beat: number, carrier: number, vol: number) {
    if (binLeftRef.current) return
    const c = ac()
    const gain = c.createGain(); gain.gain.value = vol
    const panL = c.createStereoPanner(); panL.pan.value = -1
    const panR = c.createStereoPanner(); panR.pan.value = 1
    const oscL = c.createOscillator(); oscL.type = 'sine'; oscL.frequency.value = carrier
    const oscR = c.createOscillator(); oscR.type = 'sine'; oscR.frequency.value = carrier + beat
    oscL.connect(panL).connect(gain).connect(c.destination)
    oscR.connect(panR).connect(gain).connect(c.destination)
    oscL.start(); oscR.start()
    binLeftRef.current = oscL; binRightRef.current = oscR
  }

  function stopBinaural() {
    try { binLeftRef.current?.stop() } catch {}
    try { binRightRef.current?.stop() } catch {}
    binLeftRef.current = null; binRightRef.current = null
  }

  // Guide tone: a gentle sine that glides G3↑G4 on inhale, G4↓G3 on exhale
  // Gives a musical pitch cue that rises and falls with the breath
  function startGuideTone() {
    if (guideOscRef.current) return
    const c = ac()
    const osc = c.createOscillator(), g = c.createGain()
    osc.type = 'sine'; osc.frequency.value = 196  // G3
    g.gain.value = 0.07
    osc.connect(g).connect(c.destination)
    osc.start()
    guideOscRef.current = osc; guideGainRef.current = g
  }

  function animateGuideTone(entry: PhaseEntry) {
    if (!guideOscRef.current || !ctxRef.current) return
    const osc = guideOscRef.current, now = ctxRef.current.currentTime
    osc.frequency.cancelScheduledValues(now)
    if (entry.guideDir === 'up') {
      osc.frequency.setValueAtTime(196, now)  // G3
      osc.frequency.linearRampToValueAtTime(392, now + entry.duration)  // G4
    } else if (entry.guideDir === 'down') {
      osc.frequency.setValueAtTime(392, now)  // G4
      osc.frequency.linearRampToValueAtTime(196, now + entry.duration)  // G3
    } else {
      osc.frequency.setValueAtTime(294, now)  // D4 — neutral hold
    }
  }

  function stopGuideTone() {
    try { guideOscRef.current?.stop() } catch {}
    guideOscRef.current = null; guideGainRef.current = null
  }

  function triggerBowl() {
    try { playBowlSound(ac(), 0.55) } catch {}
  }

  function teardownAudio() {
    stopHeartbeat(); stopBinaural(); stopGuideTone()
    try { ctxRef.current?.close() } catch {}
    ctxRef.current = null
  }

  // ── Session execution ─────────────────────────────────────────────────────

  function goToPhase(idx: number) {
    const queue = queueRef.current
    if (idx >= queue.length) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
      teardownAudio()
      setRunning(false); setDone(true); setPhase(null)
      return
    }
    const entry = queue[idx]
    idxRef.current = idx
    timeRef.current = entry.duration
    setPhase(entry); setTimeLeft(entry.duration); setPhaseTotal(entry.duration)
    setProgress(idx / queue.length)
    if (entry.bowl) triggerBowl()
    if (activeSession?.guideToneOn) animateGuideTone(entry)
  }

  // Keep advance pointer fresh so interval never closes over stale state
  advanceRef.current = () => goToPhase(idxRef.current + 1)

  function startSession(config: SessionConfig) {
    const queue = buildQueue(config)
    if (!queue.length) return
    queueRef.current = queue
    setActiveSession(config)
    setDone(false); setRunning(true); setPaused(false); setView('run')
    pausedRef.current = false

    if (config.heartbeatOn) startHeartbeat(config.heartbeatBpm)
    if (config.binauralOn)  startBinaural(config.binauralBeat, config.binauralCarrier, config.binauralVol)
    if (config.guideToneOn) startGuideTone()

    const first = queue[0]
    idxRef.current = 0; timeRef.current = first.duration
    setPhase(first); setTimeLeft(first.duration); setPhaseTotal(first.duration); setProgress(0)
    if (first.bowl) triggerBowl()
    if (config.guideToneOn) animateGuideTone(first)

    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = setInterval(() => {
      if (pausedRef.current) return
      timeRef.current = Math.max(0, timeRef.current - 0.1)
      setTimeLeft(timeRef.current)
      if (timeRef.current <= 0) advanceRef.current()
    }, 100)
  }

  function pauseSession() {
    pausedRef.current = true; setPaused(true)
    // Fade guide tone to silence during pause
    if (guideGainRef.current && ctxRef.current) {
      guideGainRef.current.gain.linearRampToValueAtTime(0, ctxRef.current.currentTime + 0.3)
    }
  }

  function resumeSession() {
    pausedRef.current = false; setPaused(false)
    if (guideGainRef.current && ctxRef.current) {
      guideGainRef.current.gain.linearRampToValueAtTime(0.07, ctxRef.current.currentTime + 0.3)
    }
  }

  function stopSession() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    teardownAudio()
    setRunning(false); setPaused(false); setDone(false); setPhase(null)
    setView('list')
  }

  // ── Session CRUD ──────────────────────────────────────────────────────────

  function persist(next: SessionConfig[]) { setSessions(next); saveSessions(next) }

  function saveConfig(config: SessionConfig) {
    const exists = sessions.some(s => s.id === config.id)
    persist(exists ? sessions.map(s => s.id === config.id ? config : s) : [...sessions, config])
    setView('list')
  }

  function deleteSession(id: string) { persist(sessions.filter(s => s.id !== id)) }

  function newConfig(): SessionConfig {
    return {
      id: uid(), name: 'My Session',
      technique: 'box',
      rounds: 6, breathCount: 30, breathPace: 4,
      holdDuration: 60, recoveryHold: 15,
      inhaleDuration: 4, holdInhale: 4, exhaleDuration: 4, holdExhale: 4,
      heartbeatOn: false, heartbeatBpm: 60,
      bowlOn: true, guideToneOn: false,
      binauralOn: false, binauralBeat: 10, binauralCarrier: 200, binauralVol: 0.2,
    }
  }

  // ── Pie chart ─────────────────────────────────────────────────────────────

  const PIE_R = 36
  const PIE_C = 2 * Math.PI * PIE_R
  const pieFrac = phaseTotal > 0 ? timeLeft / phaseTotal : 0
  const pieOffset = PIE_C * (1 - pieFrac)

  const colorKey = phase?.color ?? 'indigo'
  const colors = PHASE_COLORS[colorKey] ?? PHASE_COLORS.indigo

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative">

      {/* ── Toolbar button ──────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Breath Practice" aria-label="Breath Practice"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
          ${running
            ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
            : 'bg-white text-gray-500 border-gray-200 hover:border-teal-400 hover:text-teal-600'}`}
      >
        <WindIcon className="h-3.5 w-3.5" />
        {running && !done && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-200 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-100" />
          </span>
        )}
      </button>

      {/* ── Popover ─────────────────────────────────────────────────────── */}
      {open && (
        <>
          {view !== 'run' && (
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          )}

          <div className={`absolute right-0 top-10 z-50 bg-white border border-gray-200 rounded-xl shadow-xl
            overflow-y-auto max-h-[92vh]
            ${view === 'run' ? 'w-[22rem]' : 'w-80'}`}>

            {view === 'list' && (
              <ListView
                sessions={sessions}
                onStart={startSession}
                onEdit={c => { setEditing({ ...c }); setView('config') }}
                onDelete={deleteSession}
                onNew={() => { setEditing(newConfig()); setView('config') }}
                onClose={() => setOpen(false)}
              />
            )}

            {view === 'config' && editing && (
              <ConfigView
                config={editing}
                onChange={setEditing}
                onSave={() => saveConfig(editing)}
                onCancel={() => setView('list')}
              />
            )}

            {view === 'run' && (
              <RunView
                phase={phase}
                timeLeft={timeLeft}
                phaseTotal={phaseTotal}
                progress={progress}
                colors={colors}
                pieOffset={pieOffset}
                pieCirc={PIE_C}
                pieR={PIE_R}
                paused={paused}
                done={done}
                onPause={pauseSession}
                onResume={resumeSession}
                onStop={stopSession}
              />
            )}

          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ListView
// ─────────────────────────────────────────────────────────────────────────────

function ListView({ sessions, onStart, onEdit, onDelete, onNew, onClose }: {
  sessions: SessionConfig[]
  onStart: (c: SessionConfig) => void
  onEdit: (c: SessionConfig) => void
  onDelete: (id: string) => void
  onNew: () => void
  onClose: () => void
}) {
  return (
    <div className="p-4 space-y-4">

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WindIcon className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-semibold text-gray-800">Breath Practice</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
          </svg>
        </button>
      </div>

      <button onClick={onNew}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-gray-200 text-xs text-gray-400 hover:border-teal-300 hover:text-teal-600 transition-colors">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        New session
      </button>

      <div className="space-y-2">
        {sessions.map(s => (
          <div key={s.id} className="group border border-gray-100 rounded-xl overflow-hidden hover:border-teal-200 transition-colors">
            <div className="flex items-start gap-3 px-3 py-3">
              <button onClick={() => onStart(s)}
                className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center hover:bg-teal-600 hover:text-white transition-colors">
                <svg className="h-3.5 w-3.5 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{s.name}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {TECHNIQUE_META[s.technique].label} · {s.rounds} rounds · {totalMins(s)}
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {s.heartbeatOn && <Badge color="red">♥ heartbeat</Badge>}
                  {s.bowlOn      && <Badge color="amber">◎ bowl</Badge>}
                  {s.guideToneOn && <Badge color="teal">♪ guide tone</Badge>}
                  {s.binauralOn  && <Badge color="indigo">〜 binaural</Badge>}
                </div>
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onEdit(s)} className="p-1 text-gray-400 hover:text-gray-700">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button onClick={() => onDelete(s.id)} className="p-1 text-gray-400 hover:text-red-500">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-gray-300 text-center">Sit comfortably · use headphones for binaural</p>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const cls: Record<string, string> = {
    red:    'bg-red-50 text-red-400',
    amber:  'bg-amber-50 text-amber-500',
    teal:   'bg-teal-50 text-teal-600',
    indigo: 'bg-indigo-50 text-indigo-400',
  }
  return (
    <span className={`inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-full ${cls[color] ?? 'bg-gray-50 text-gray-400'}`}>
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfigView
// ─────────────────────────────────────────────────────────────────────────────

function ConfigView({ config, onChange, onSave, onCancel }: {
  config: SessionConfig
  onChange: (c: SessionConfig | null) => void
  onSave: () => void
  onCancel: () => void
}) {
  const set = <K extends keyof SessionConfig>(k: K, v: SessionConfig[K]) =>
    onChange({ ...config, [k]: v })

  const t = config.technique
  const isWimHof  = t === 'wim-hof'
  const isBox     = t === 'box'
  const is478     = t === '4-7-8'
  const isTimed   = isBox || is478

  return (
    <div className="p-4 space-y-5">

      <div className="flex items-center gap-2">
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-800">Configure Session</span>
      </div>

      {/* Name */}
      <div className="space-y-1">
        <SL>Name</SL>
        <input type="text" value={config.name} onChange={e => set('name', e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-teal-400"
          placeholder="Session name" />
      </div>

      {/* Technique */}
      <div className="space-y-1.5">
        <SL>Technique</SL>
        <div className="grid grid-cols-1 gap-1">
          {(Object.keys(TECHNIQUE_META) as Technique[]).map(tech => (
            <button key={tech} onClick={() => set('technique', tech)}
              className={`flex flex-col items-start px-3 py-2 rounded-lg text-xs transition-colors text-left
                ${config.technique === tech
                  ? 'bg-teal-600 text-white'
                  : 'bg-gray-50 text-gray-700 hover:bg-teal-50 hover:text-teal-700'}`}>
              <span className="font-medium">{TECHNIQUE_META[tech].label}</span>
              <span className={`text-[10px] mt-0.5 leading-snug ${config.technique === tech ? 'text-teal-100' : 'text-gray-400'}`}>
                {TECHNIQUE_META[tech].desc}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Rounds */}
      <div className="space-y-3">
        <SL>Session</SL>
        <SliderRow label="Rounds" value={config.rounds} min={1} max={10} display={`${config.rounds}×`} onChange={v => set('rounds', v)} />
      </div>

      {/* Wim Hof params */}
      {isWimHof && (
        <div className="space-y-3">
          <SL>Wim Hof</SL>
          <SliderRow label="Breaths per round" value={config.breathCount} min={10} max={60} display={`${config.breathCount}`} onChange={v => set('breathCount', v)} />
          <SliderRow label="Breath pace" value={config.breathPace} min={2} max={8} display={`${config.breathPace}s / breath`} onChange={v => set('breathPace', v)} />
          <SliderRow label="Retention hold" value={config.holdDuration} min={30} max={300} step={5} display={`${config.holdDuration}s`} onChange={v => set('holdDuration', v)} />
          <SliderRow label="Recovery hold" value={config.recoveryHold} min={10} max={30} display={`${config.recoveryHold}s`} onChange={v => set('recoveryHold', v)} />
        </div>
      )}

      {/* Timed technique timing */}
      {isTimed && (
        <div className="space-y-3">
          <SL>Timing</SL>
          {is478 ? (
            <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
              4-7-8 uses fixed ratios: <strong>inhale 4s → hold 7s → exhale 8s</strong>. Adjust rounds above.
            </div>
          ) : (
            <>
              <SliderRow label="Inhale" value={config.inhaleDuration} min={2} max={12} display={`${config.inhaleDuration}s`} onChange={v => set('inhaleDuration', v)} />
              <SliderRow label="Hold after inhale" value={config.holdInhale} min={0} max={12} display={config.holdInhale > 0 ? `${config.holdInhale}s` : 'off'} onChange={v => set('holdInhale', v)} />
              <SliderRow label="Exhale" value={config.exhaleDuration} min={2} max={16} display={`${config.exhaleDuration}s`} onChange={v => set('exhaleDuration', v)} />
              <SliderRow label="Hold after exhale" value={config.holdExhale} min={0} max={12} display={config.holdExhale > 0 ? `${config.holdExhale}s` : 'off'} onChange={v => set('holdExhale', v)} />
            </>
          )}
        </div>
      )}

      {/* Sounds */}
      <div className="space-y-3">
        <SL>Sound</SL>
        <div className="space-y-2.5">
          <Row label="Tibetan bowl (phase cues)">
            <Toggle on={config.bowlOn} onChange={v => set('bowlOn', v)} label="Bowl" />
          </Row>
          <Row label="Musical guide tone (breath pitch cue)">
            <Toggle on={config.guideToneOn} onChange={v => set('guideToneOn', v)} label="Guide tone" />
          </Row>
          <Row label="Heartbeat">
            <Toggle on={config.heartbeatOn} onChange={v => set('heartbeatOn', v)} label="Heartbeat" />
          </Row>
          {config.heartbeatOn && (
            <SliderRow label="BPM" value={config.heartbeatBpm} min={40} max={100} display={`${config.heartbeatBpm} bpm`} onChange={v => set('heartbeatBpm', v)} />
          )}
        </div>
      </div>

      {/* Binaural */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SL>Binaural Beats</SL>
          <Toggle on={config.binauralOn} onChange={v => set('binauralOn', v)} label="Binaural" />
        </div>
        {config.binauralOn && (
          <div className="space-y-3">
            <div className="grid grid-cols-5 gap-1">
              {[
                { beat: 2,  carrier: 150, label: 'Delta', desc: '2 Hz — deep' },
                { beat: 6,  carrier: 180, label: 'Theta', desc: '6 Hz — meditate' },
                { beat: 10, carrier: 200, label: 'Alpha', desc: '10 Hz — relax' },
                { beat: 20, carrier: 220, label: 'Beta',  desc: '20 Hz — focus' },
                { beat: 40, carrier: 240, label: 'Gamma', desc: '40 Hz — peak' },
              ].map(p => {
                const active = config.binauralBeat === p.beat && config.binauralCarrier === p.carrier
                return (
                  <button key={p.label} onClick={() => { set('binauralBeat', p.beat); onChange({ ...config, binauralBeat: p.beat, binauralCarrier: p.carrier }) }}
                    title={p.desc}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-colors
                      ${active ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-teal-50 hover:text-teal-700'}`}>
                    {p.label}
                  </button>
                )
              })}
            </div>
            <SliderRow label="Beat frequency" value={config.binauralBeat} min={1} max={40} step={0.5} display={`${config.binauralBeat.toFixed(1)} Hz`} onChange={v => set('binauralBeat', v)} />
            <SliderRow label="Volume" value={Math.round(config.binauralVol * 100)} min={5} max={60} display={`${Math.round(config.binauralVol * 100)}%`} onChange={v => set('binauralVol', v / 100)} />
            <p className="text-[10px] text-gray-400">Use headphones for binaural effect</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button onClick={onSave} className="flex-1 py-2 rounded-lg text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors">
          Save
        </button>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-600">{label}</span>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RunView
// ─────────────────────────────────────────────────────────────────────────────

function RunView({
  phase, timeLeft, phaseTotal, progress,
  colors, pieOffset, pieCirc, pieR,
  paused, done,
  onPause, onResume, onStop,
}: {
  phase: PhaseEntry | null
  timeLeft: number
  phaseTotal: number
  progress: number
  colors: { circle: string; arc: string; textClass: string }
  pieOffset: number
  pieCirc: number
  pieR: number
  paused: boolean
  done: boolean
  onPause: () => void
  onResume: () => void
  onStop: () => void
}) {
  const scale  = phase?.circleScale ?? 1.0
  const dur    = phase?.duration ?? 2
  const ease   = phase?.easing ?? 'ease-in-out'
  const isHold = phase?.isHold ?? false

  return (
    <div className="p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WindIcon className="h-4 w-4 text-teal-600" />
          <div>
            <p className="text-xs font-semibold text-gray-800">{done ? 'Complete' : (phase?.label ?? 'Starting…')}</p>
            {!done && phase?.subLabel && (
              <p className="text-[10px] text-gray-400">{phase.subLabel}</p>
            )}
          </div>
        </div>
        <button onClick={onStop}
          className="text-[11px] text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded border border-gray-200 hover:border-gray-300 transition-colors">
          End
        </button>
      </div>

      {/* Overall progress */}
      <div className="h-0.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full bg-teal-400 transition-all duration-500"
          style={{ width: `${progress * 100}%` }} />
      </div>

      {done ? (
        /* ── Completion screen ── */
        <div className="py-8 flex flex-col items-center gap-3 text-center">
          <div className="text-5xl">🌿</div>
          <p className="text-base font-semibold text-gray-700">Well done</p>
          <p className="text-xs text-gray-400 leading-relaxed max-w-[14rem]">
            Take a moment to rest in the stillness before you move.
          </p>
          <button onClick={onStop}
            className="mt-3 px-6 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors">
            Close
          </button>
        </div>
      ) : (
        <>
          {/* ── Instruction ── */}
          <div className="text-center space-y-0.5">
            <p className={`text-base font-semibold ${colors.textClass}`}>
              {paused ? 'Paused' : (phase?.action ?? '…')}
            </p>
            <p className="text-xs text-gray-400">{paused ? 'Tap resume to continue' : (phase?.instruction ?? '')}</p>
          </div>

          {/* ── Breathing circle ── */}
          <div className="flex justify-center py-2">
            <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>

              {/* Outer fuzzy glow — larger, blurred */}
              <div
                className={`absolute rounded-full ${isHold && !paused ? 'animate-pulse' : ''}`}
                style={{
                  width: 160, height: 160,
                  backgroundColor: colors.circle,
                  opacity: 0.18,
                  filter: 'blur(28px)',
                  transform: `scale(${scale * 1.4})`,
                  transition: `transform ${dur}s ${ease}`,
                }}
              />

              {/* Mid glow ring */}
              <div
                className="absolute rounded-full"
                style={{
                  width: 140, height: 140,
                  backgroundColor: colors.circle,
                  opacity: 0.12,
                  filter: 'blur(12px)',
                  transform: `scale(${scale * 1.15})`,
                  transition: `transform ${dur}s ${ease}`,
                }}
              />

              {/* Main circle */}
              <div
                className="absolute rounded-full"
                style={{
                  width: 120, height: 120,
                  background: `radial-gradient(circle at 38% 32%, ${colors.circle}ff 0%, ${colors.arc} 100%)`,
                  boxShadow: `0 0 24px 6px ${colors.circle}55, 0 0 60px 18px ${colors.circle}22`,
                  transform: `scale(${scale})`,
                  transition: `transform ${dur}s ${ease}`,
                  opacity: paused ? 0.5 : 1,
                }}
              />

            </div>
          </div>

          {/* ── Countdown pie (shown for hold phases and any phase > 4s) ── */}
          {phaseTotal >= 4 && (
            <div className="flex flex-col items-center gap-1">
              <div className="relative" style={{ width: 88, height: 88 }}>
                <svg width="88" height="88" className="-rotate-90">
                  <circle cx="44" cy="44" r={pieR} fill="none" stroke="#f1f5f9" strokeWidth="5" />
                  <circle cx="44" cy="44" r={pieR} fill="none" stroke={colors.arc} strokeWidth="5"
                    strokeDasharray={pieCirc}
                    strokeDashoffset={pieOffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold tabular-nums text-gray-700 leading-none">
                    {Math.ceil(timeLeft)}
                  </span>
                  <span className="text-[9px] text-gray-400 mt-0.5">sec</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Controls ── */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={paused ? onResume : onPause}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors
                ${paused
                  ? 'bg-teal-600 text-white hover:bg-teal-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button onClick={onStop}
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
              ⏹ Stop
            </button>
          </div>
        </>
      )}
    </div>
  )
}
