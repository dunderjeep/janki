'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// ── Model ─────────────────────────────────────────────────────────────────────

type Phase = 'focus' | 'short' | 'long'

interface Settings {
  focus: number       // minutes
  short: number       // minutes
  long: number        // minutes
  every: number       // focus sessions per long break
  autoStart: boolean
  chime: boolean
  volume: number      // 0–1
  notify: boolean
}

interface Timer {
  phase: Phase
  status: 'idle' | 'running' | 'paused'
  endsAt: number      // epoch ms; meaningful while running
  leftMs: number      // meaningful while paused
  totalMs: number     // length of this session, fixed when it started
  round: number       // focus sessions finished since the last long break
  due: boolean        // a session ended and nobody has looked yet
}

const DEFAULTS: Settings = {
  focus: 25, short: 5, long: 15, every: 4,
  autoStart: false, chime: true, volume: 0.5, notify: false,
}

const IDLE: Timer = {
  phase: 'focus', status: 'idle', endsAt: 0, leftMs: 0, totalMs: 0, round: 0, due: false,
}

const PRESETS = [
  { focus: 25, short: 5 },
  { focus: 50, short: 10 },
  { focus: 90, short: 20 },
]

const PHASES: { type: Phase; label: string }[] = [
  { type: 'focus', label: 'Focus' },
  { type: 'short', label: 'Break' },
  { type: 'long',  label: 'Long break' },
]

const SETTINGS_KEY = 'janki.pomodoro.settings'
const TIMER_KEY    = 'janki.pomodoro.timer'

const phaseMs = (s: Settings, phase: Phase) => s[phase] * 60_000

/** The session after this one. A skipped focus session does not count as a round. */
function advance(t: Timer, s: Settings, counted: boolean): Timer {
  const round = t.phase === 'long' ? 0 : t.phase === 'focus' && counted ? t.round + 1 : t.round
  const phase: Phase = t.phase !== 'focus' ? 'focus' : counted && round >= s.every ? 'long' : 'short'
  return { ...IDLE, phase, round }
}

function run(t: Timer, s: Settings): Timer {
  const totalMs = phaseMs(s, t.phase)
  return { ...t, status: 'running', endsAt: Date.now() + totalMs, leftMs: totalMs, totalMs, due: false }
}

function readJson<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* the timer still works this session */ }
}

function clock(ms: number) {
  const total = Math.ceil(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Whole minutes in the navbar; seconds only once there is less than a minute to go. */
function compact(ms: number) {
  return ms > 60_000 ? `${Math.ceil(ms / 60_000)}m` : `${Math.ceil(ms / 1000)}s`
}

// ── Chime ─────────────────────────────────────────────────────────────────────

// Rising after work, falling after a break, so you can tell which without looking.
const CHIMES: Record<Phase, number[]> = {
  focus: [659.25, 783.99, 1046.5],
  short: [1046.5, 783.99],
  long:  [1046.5, 783.99, 659.25],
}

function ringBell(ctx: AudioContext, vol: number, notes: number[]) {
  const start = ctx.currentTime + 0.05
  notes.forEach((freq, i) => {
    const t = start + i * 0.28
    ;[[freq, 1], [freq * 2, 0.25]].forEach(([f, level]) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.type = 'sine'; osc.frequency.value = f
      gain.gain.setValueAtTime(Math.max(0.0002, vol * 0.5 * level), t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t); osc.stop(t + 1.45)
    })
  })
  return 0.05 + (notes.length - 1) * 0.28 + 1.45
}

// ── UI helpers ────────────────────────────────────────────────────────────────
// Kept outside the component: it re-renders every second, and a component
// defined inside it would remount and drop a slider in mid-drag.

function SectionLabel({ children }: { children: ReactNode }) {
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
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onChange={e => onChange(Number(e.target.value))} className="w-full accent-indigo-600" />
    </div>
  )
}

function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between text-xs text-gray-500">
      <span>{label}</span>
      <button onClick={() => onChange(!on)} role="switch" aria-checked={on} aria-label={label}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors
          ${on ? 'bg-indigo-600' : 'bg-gray-200'}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform
          ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

/** Idle: a clock face. Otherwise: a wedge of remaining time that winds down to twelve. */
function Dial({ fraction }: { fraction: number | null }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      {fraction === null
        ? <path d="M12 6.5V12l3.5 2" />
        : <circle cx="12" cy="12" r="3.5" strokeWidth="7" strokeLinecap="butt" pathLength={1}
            strokeDasharray={`${fraction} 1`} transform="rotate(-90 12 12)" />}
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PomodoroTimer() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [timer,    setTimer   ] = useState<Timer>(IDLE)
  const [now,      setNow     ] = useState(0)
  const [open,     setOpen    ] = useState(false)
  const [canNotify,     setCanNotify    ] = useState(false)
  const [notifyBlocked, setNotifyBlocked] = useState(false)

  // Read from the worker's tick and from storage events, outside React's render.
  const settingsRef = useRef(settings)
  const timerRef    = useRef(timer)
  const audioRef    = useRef<AudioContext | null>(null)

  function adopt(t: Timer) {
    timerRef.current = t
    setTimer(t)
    setNow(Date.now())
  }

  function commit(t: Timer) {
    adopt(t)
    writeJson(TIMER_KEY, t)
  }

  function updateSettings(patch: Partial<Settings>) {
    const s = { ...settingsRef.current, ...patch }
    settingsRef.current = s
    setSettings(s)
    writeJson(SETTINGS_KEY, s)
  }

  // ── Sound and notification ─────────────────────────────────────────────────

  function audio() {
    if (!audioRef.current) audioRef.current = new AudioContext()
    return audioRef.current
  }

  /** Unlock audio during a click, then go quiet so no output stream sits open for the whole session. */
  function primeAudio() {
    try {
      const ctx = audio()
      void ctx.resume().then(() => ctx.suspend())
    } catch { /* no Web Audio: the button still turns amber */ }
  }

  async function chime(phase: Phase, volume: number) {
    try {
      const ctx = audio()
      // resume() stays pending without a prior click, so it can't simply be awaited.
      await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 500))])
      if (ctx.state !== 'running') return
      const seconds = ringBell(ctx, volume, CHIMES[phase])
      setTimeout(() => void ctx.suspend(), seconds * 1000 + 200)
    } catch { /* no Web Audio: the button still turns amber */ }
  }

  function notifyEnded(ended: Phase, next: Timer, s: Settings) {
    if (!s.notify || !('Notification' in window) || Notification.permission !== 'granted') return
    const title = ended === 'focus' ? 'Focus session done' : 'Break over'
    const body  = next.phase === 'focus' ? `Next: ${s.focus} min focus` : `Next: ${s[next.phase]} min break`
    try { new Notification(title, { body, tag: 'janki-pomodoro' }) } catch { /* unsupported on this browser */ }
  }

  async function setNotify(on: boolean) {
    setNotifyBlocked(false)
    if (!on) return updateSettings({ notify: false })
    const permission = await Notification.requestPermission()
    updateSettings({ notify: permission === 'granted' })
    setNotifyBlocked(permission !== 'granted')
  }

  // ── Timer ──────────────────────────────────────────────────────────────────

  function expire() {
    const t = timerRef.current
    const s = settingsRef.current

    // Another tab got here first and has already moved the shared timer on.
    const stored = readJson<Timer>(TIMER_KEY)
    if (stored && (stored.status !== 'running' || stored.endsAt !== t.endsAt)) {
      adopt({ ...IDLE, ...stored })
      return
    }

    const next = advance(t, s, true)
    // Auto-start stops after the long break: it is the natural end of a set,
    // and the timer shouldn't cycle all night if you walk away.
    commit(s.autoStart && t.phase !== 'long' ? run(next, s) : { ...next, due: true })
    if (s.chime) void chime(t.phase, s.volume)
    notifyEnded(t.phase, next, s)
  }

  useEffect(() => {
    const stored = readJson<Settings>(SETTINGS_KEY)
    const s = { ...DEFAULTS, ...stored }
    settingsRef.current = s
    setSettings(s)

    const savedTimer = readJson<Timer>(TIMER_KEY)
    if (savedTimer) {
      const t = { ...IDLE, ...savedTimer }
      // Ended while the page was closed: nothing to ring for, so just show it.
      if (t.status === 'running' && t.endsAt <= Date.now()) commit({ ...advance(t, s, true), due: true })
      else adopt(t)
    }
    setCanNotify('Notification' in window)

    function onStorage(e: StorageEvent) {
      if (!e.newValue) return
      if (e.key === TIMER_KEY) adopt({ ...IDLE, ...JSON.parse(e.newValue) })
      if (e.key === SETTINGS_KEY) {
        const next = { ...DEFAULTS, ...JSON.parse(e.newValue) }
        settingsRef.current = next
        setSettings(next)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ticks come from a worker because Chrome throttles a hidden tab's own timers
  // to about once a minute, and a timer's whole job is to end on time in the
  // background. The countdown itself is always endsAt minus the wall clock.
  useEffect(() => {
    if (timer.status !== 'running') return
    function tick() {
      const n = Date.now()
      setNow(n)
      if (timerRef.current.status === 'running' && n >= timerRef.current.endsAt) expire()
    }
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),1000)'], { type: 'text/javascript' }))
      const worker = new Worker(url)
      URL.revokeObjectURL(url)
      worker.onmessage = tick
      return () => worker.terminate()
    } catch {
      const id = setInterval(tick, 1000)
      return () => clearInterval(id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.status, timer.endsAt])

  // ── Actions ────────────────────────────────────────────────────────────────

  function start() {
    primeAudio()
    commit(run(timer, settings))
  }

  function pause() {
    commit({ ...timer, status: 'paused', leftMs: Math.max(0, timer.endsAt - Date.now()) })
  }

  function resume() {
    primeAudio()
    commit({ ...timer, status: 'running', endsAt: Date.now() + timer.leftMs })
  }

  function reset() {
    commit({ ...IDLE, phase: timer.phase, round: timer.round })
  }

  function skip() {
    const next = advance(timer, settings, false)
    commit(timer.status === 'running' ? run(next, settings) : next)
  }

  function openPopover() {
    setOpen(true)
    if (timer.due) commit({ ...timer, due: false })
  }

  // A session can end with the popover already open, so closing clears it too.
  function closePopover() {
    setOpen(false)
    if (timer.due) commit({ ...timer, due: false })
  }

  // ── Derived display ────────────────────────────────────────────────────────

  const active  = timer.status !== 'idle'
  const running = timer.status === 'running'
  const isBreak = timer.phase !== 'focus'
  const leftMs  = running ? Math.max(0, timer.endsAt - now)
    : timer.status === 'paused' ? timer.leftMs
    : phaseMs(settings, timer.phase)
  const phaseLabel = PHASES.find(p => p.type === timer.phase)!.label

  const buttonText = timer.due ? 'Done' : compact(leftMs)
  const buttonTitle = timer.due
    ? 'Pomodoro: session finished'
    : `Pomodoro: ${phaseLabel}, ${clock(leftMs)}${timer.status === 'paused' ? ' (paused)' : ''}`

  const buttonColour = timer.due
    ? 'bg-amber-500 text-white border-amber-500 animate-pulse'
    : running && isBreak ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
    : running ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
    : timer.status === 'paused' ? 'bg-indigo-50 text-indigo-600 border-indigo-300 hover:border-indigo-400'
    : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'

  const primary = running
    ? { label: '⏸ Pause', action: pause }
    : timer.status === 'paused'
    ? { label: '▶ Resume', action: resume }
    : { label: '▶ Start', action: start }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative shrink-0">

      {/* Toolbar button */}
      <button onClick={openPopover} title={buttonTitle} aria-label={buttonTitle}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ${buttonColour}`}>
        <Dial fraction={active && timer.totalMs > 0 ? leftMs / timer.totalMs : null} />
        <span className="tabular-nums">{buttonText}</span>
      </button>

      {/* Popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={closePopover} />
          <div className="max-sm:fixed max-sm:inset-x-4 max-sm:top-24 sm:absolute sm:right-0 sm:top-10 sm:w-80 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-4 space-y-4 max-h-[85vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800">Pomodoro</span>
              <button onClick={closePopover} aria-label="Close" className="text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                </svg>
              </button>
            </div>

            {/* ══ COUNTDOWN ══ */}
            <section className="space-y-3">
              <div className="grid grid-cols-3 gap-1">
                {PHASES.map(p => (
                  <button key={p.type} disabled={active} title={active ? 'Reset the timer to switch' : undefined}
                    onClick={() => commit({ ...IDLE, phase: p.type, round: timer.round })}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-colors disabled:cursor-not-allowed
                      ${timer.phase === p.type
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 enabled:hover:bg-indigo-50 enabled:hover:text-indigo-600 disabled:opacity-50'}`}>
                    {p.label}
                  </button>
                ))}
              </div>

              <p className={`text-center text-5xl font-semibold tabular-nums tracking-tight
                ${isBreak ? 'text-emerald-600' : 'text-gray-800'}`}>
                {clock(leftMs)}
              </p>

              <div className="flex items-center justify-center gap-2">
                <span className="flex gap-1" role="img" aria-label={`${Math.min(timer.round, settings.every)} of ${settings.every} sessions done`}>
                  {Array.from({ length: settings.every }, (_, i) => (
                    <span key={i} className={`h-2 w-2 rounded-full ${i < timer.round ? 'bg-indigo-600' : 'bg-gray-200'}`} />
                  ))}
                </span>
                {timer.round > 0 && (
                  <button onClick={() => commit({ ...timer, round: 0 })}
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                    clear
                  </button>
                )}
              </div>

              <button onClick={primary.action}
                className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors
                  ${running
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                {primary.label}
              </button>

              <div className="grid grid-cols-2 gap-1">
                <button onClick={reset} disabled={!active}
                  className="py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 enabled:hover:bg-indigo-50 enabled:hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  Reset
                </button>
                <button onClick={skip}
                  className="py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                  Skip
                </button>
              </div>
            </section>

            {/* ══ DURATIONS ══ */}
            <section className="space-y-3">
              <SectionLabel>Durations</SectionLabel>
              <div className="grid grid-cols-3 gap-1">
                {PRESETS.map(p => (
                  <button key={p.focus} onClick={() => updateSettings(p)}
                    className={`py-1.5 rounded-lg text-xs font-medium tabular-nums transition-colors
                      ${settings.focus === p.focus && settings.short === p.short
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                    {p.focus} / {p.short}
                  </button>
                ))}
              </div>
              <SliderRow label="Focus" value={settings.focus} display={`${settings.focus} min`}
                min={1} max={120} step={1} onChange={focus => updateSettings({ focus })} />
              <SliderRow label="Break" value={settings.short} display={`${settings.short} min`}
                min={1} max={30} step={1} onChange={short => updateSettings({ short })} />
              <SliderRow label="Long break" value={settings.long} display={`${settings.long} min`}
                min={1} max={60} step={1} onChange={long => updateSettings({ long })} />
              <SliderRow label="Sessions before long break" value={settings.every} display={`${settings.every}`}
                min={2} max={8} step={1} onChange={every => updateSettings({ every })} />
              {active && (
                <p className="text-[10px] text-gray-400 leading-snug">Changes apply from the next session.</p>
              )}
            </section>

            {/* ══ WHEN IT ENDS ══ */}
            <section className="space-y-3">
              <SectionLabel>When a session ends</SectionLabel>
              <ToggleRow label="Start the next one automatically" on={settings.autoStart}
                onChange={autoStart => updateSettings({ autoStart })} />
              <ToggleRow label="Chime" on={settings.chime} onChange={c => updateSettings({ chime: c })} />
              {settings.chime && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <SliderRow label="Chime volume" value={settings.volume} display={`${Math.round(settings.volume * 100)}%`}
                      min={0} max={1} step={0.01} onChange={volume => updateSettings({ volume })} />
                  </div>
                  <button onClick={() => void chime('focus', settings.volume)}
                    className="text-[10px] px-1.5 py-0.5 mb-1 rounded font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                    test
                  </button>
                </div>
              )}
              {canNotify && (
                <ToggleRow label="Desktop notification" on={settings.notify} onChange={v => void setNotify(v)} />
              )}
              {notifyBlocked && (
                <p className="text-[10px] text-gray-400 leading-snug">Notifications are blocked in this browser&apos;s site settings.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
