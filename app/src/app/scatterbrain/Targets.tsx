'use client'

/** The top-bar panel: countdown timer, session target and the target for the whole work. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseWordTarget, type WorkView } from '@/lib/scatterbrain/types'
import { api, jsonBody } from '../porcupin/intake'
import Field from './Field'
import type { Actions } from './Workspace'

const PRESETS = [5, 10, 15, 25, 45, 60]
const STORAGE_KEY = 'scatterbrain:timer'

type Timer = {
  status: 'idle' | 'running' | 'paused' | 'done'
  durationMs: number
  remainingMs: number
  /** When a running timer reaches zero. */
  endsAt: number | null
  /** Session words when it started, so the end can say what the sprint produced. */
  startWords: number
}

const IDLE: Timer = { status: 'idle', durationMs: 25 * 60_000, remainingMs: 25 * 60_000, endsAt: null, startWords: 0 }

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

function chime(context: AudioContext | null) {
  try {
    const audio = context ?? new AudioContext()
    void audio.resume()
    ;[523.25, 659.25, 783.99].forEach((frequency, i) => {
      const start = audio.currentTime + i * 0.22
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7)
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.75)
    })
  } catch {
    // No sound available: the on-screen notice still appears.
  }
}

/** Kept in the browser, so a reload or a switch to another work leaves it running. */
function useCountdown(sessionWords: number, note: (message: string) => void) {
  const [timer, setTimer] = useState<Timer>(IDLE)
  const [now, setNow] = useState(0)
  const audio = useRef<AudioContext | null>(null)
  const words = useRef(sessionWords)
  words.current = sessionWords

  const store = useCallback((next: Timer) => {
    setTimer(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {}
  }, [])

  useEffect(() => {
    let saved: Timer | null = null
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Timer | null
    } catch {}
    if (!saved) return
    // Ran out while the page was closed: show it, but do not chime at a fresh page load.
    if (saved.status === 'running' && (saved.endsAt ?? 0) <= Date.now()) saved = { ...saved, status: 'done', endsAt: null, remainingMs: 0 }
    setNow(Date.now())
    setTimer(saved)
  }, [])

  useEffect(() => {
    if (timer.status !== 'running') return
    const tick = () => {
      const at = Date.now()
      setNow(at)
      if ((timer.endsAt ?? 0) > at) return
      store({ ...timer, status: 'done', endsAt: null, remainingMs: 0 })
      chime(audio.current)
      const written = words.current - timer.startWords
      note(`Time's up! ${written > 0 ? `${written.toLocaleString()} words this sprint.` : 'Timer finished.'}`)
    }
    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [note, store, timer])

  const remainingMs = timer.status === 'running' ? Math.max(0, (timer.endsAt ?? 0) - now) : timer.remainingMs

  // Readable from another tab, which is where you are if you have wandered off.
  useEffect(() => {
    if (timer.status !== 'running') return
    const original = document.title
    return () => { document.title = original }
  }, [timer.status])
  useEffect(() => {
    if (timer.status === 'running') document.title = `${clock(remainingMs)} · Scatterbrain`
  }, [remainingMs, timer.status])

  const unlockAudio = () => {
    try {
      audio.current ??= new AudioContext()
      void audio.current.resume()
    } catch {}
  }

  return {
    timer,
    remainingMs,
    start(durationMs: number) {
      unlockAudio()
      setNow(Date.now())
      store({ status: 'running', durationMs, remainingMs: durationMs, endsAt: Date.now() + durationMs, startWords: words.current })
    },
    pause() {
      store({ ...timer, status: 'paused', endsAt: null, remainingMs })
    },
    resume() {
      unlockAudio()
      setNow(Date.now())
      store({ ...timer, status: 'running', endsAt: Date.now() + timer.remainingMs })
    },
    reset() {
      store({ ...IDLE, durationMs: timer.durationMs, remainingMs: timer.durationMs })
    },
  }
}

function Meter({ value, target, label }: { value: number; target: number; label: string }) {
  const percent = Math.max(0, Math.min(100, (value / target) * 100))
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.max(0, Math.min(value, target))} className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-gray-200">
      <div className={`h-full ${value >= target ? 'bg-emerald-500' : 'bg-purple-600'}`} style={{ width: `${percent}%` }} />
    </div>
  )
}

function Stat({ label, value, target }: { label: string; value: number; target: number | null }) {
  return (
    <span className="block w-28 text-left">
      <span className="block whitespace-nowrap text-[11px] leading-tight text-gray-500">
        {label}{' '}
        <span className="font-medium tabular-nums text-gray-800">{value.toLocaleString()}</span>
        {target ? <span className="tabular-nums"> / {target.toLocaleString()}</span> : null}
      </span>
      {target ? <Meter value={value} target={target} label={`${label} target`} /> : null}
    </span>
  )
}

export default function Targets({ work, total, actions }: { work: WorkView; total: number; actions: Actions }) {
  const { note, refresh } = actions
  const [open, setOpen] = useState(false)
  const [minutes, setMinutes] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const countdown = useCountdown(work.sessionWords, note)
  const { timer, remainingMs } = countdown

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  // Announced only on the way across the line, not on every later save.
  const previous = useRef({ session: work.sessionWords, total })
  useEffect(() => {
    const before = previous.current
    if (work.sessionTarget && before.session < work.sessionTarget && work.sessionWords >= work.sessionTarget) note('Session target reached!')
    if (work.targetWords && before.total < work.targetWords && total >= work.targetWords) note(`${work.title} reached its word target!`)
    previous.current = { session: work.sessionWords, total }
  }, [note, total, work.sessionTarget, work.sessionWords, work.targetWords, work.title])

  const save = (patch: object) =>
    api(`/api/scatterbrain/works/${work.id}`, jsonBody('PATCH', patch)).then(() => refresh()).catch((e: Error) => note(e.message))

  const customMs = Number(minutes) * 60_000
  const customValid = customMs > 0 && customMs <= 24 * 3_600_000
  const button = 'rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 hover:border-purple-300 hover:text-purple-700'

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Targets and timer"
        className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-1 hover:border-purple-300"
      >
        <span role="timer" className={`whitespace-nowrap text-sm font-medium tabular-nums ${timer.status === 'done' ? 'text-emerald-700' : timer.status === 'running' ? 'text-purple-700' : 'text-gray-500'}`}>
          {timer.status === 'idle' ? 'Timer' : timer.status === 'done' ? "Time's up" : clock(remainingMs)}
          {timer.status === 'paused' && <span className="ml-1 text-[11px] font-normal">paused</span>}
        </span>
        <Stat label="Session" value={work.sessionWords} target={work.sessionTarget} />
        <Stat label="Work" value={total} target={work.targetWords} />
      </button>

      {open && (
        <div role="dialog" aria-label="Targets and timer" className="absolute right-0 top-full z-40 mt-1 w-80 space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Countdown</h2>
            {timer.status === 'idle' ? (
              <>
                <div className="mt-2 grid grid-cols-6 gap-1">
                  {PRESETS.map((m) => <button key={m} onClick={() => countdown.start(m * 60_000)} className={button}>{m}</button>)}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (customValid) countdown.start(customMs)
                  }}
                  className="mt-2 flex items-center gap-2"
                >
                  <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="decimal" placeholder="Other" aria-label="Minutes" className="w-20 rounded-md border border-gray-200 px-2 py-1 text-sm" />
                  <span className="text-xs text-gray-500">minutes</span>
                  <button disabled={!customValid} className={`${button} ml-auto disabled:opacity-40`}>Start</button>
                </form>
              </>
            ) : (
              <>
                <div className="mt-1 text-3xl font-semibold tabular-nums text-gray-900">{timer.status === 'done' ? "Time's up" : clock(remainingMs)}</div>
                {work.sessionWords - timer.startWords > 0 && (
                  <div className="text-xs text-purple-700">+{(work.sessionWords - timer.startWords).toLocaleString()} words this sprint</div>
                )}
                <div className="mt-2 flex gap-2">
                  {timer.status === 'running' && <button onClick={countdown.pause} className={button}>Pause</button>}
                  {timer.status === 'paused' && <button onClick={countdown.resume} className={button}>Resume</button>}
                  {timer.status === 'done' && <button onClick={() => countdown.start(timer.durationMs)} className={button}>Again</button>}
                  <button onClick={countdown.reset} className={button}>{timer.status === 'done' ? 'Clear' : 'Stop'}</button>
                </div>
              </>
            )}
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Today&apos;s session</h2>
            <div className="mt-1 flex items-baseline justify-between text-sm">
              <span className="tabular-nums text-gray-900">{work.sessionWords.toLocaleString()} words</span>
              <button onClick={() => void save({ resetSession: true })} className="text-xs text-gray-500 hover:text-purple-700">Start over</button>
            </div>
            {work.sessionTarget ? <Meter value={work.sessionWords} target={work.sessionTarget} label="Session target" /> : null}
            <Field key={`session:${work.id}`} label="Session target" className="mt-2" placeholder="Words per sitting" value={work.sessionTarget ? String(work.sessionTarget) : ''} onSave={(value) => void save({ sessionTarget: parseWordTarget(value) })} />
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">This work</h2>
            <div className="mt-1 text-sm tabular-nums text-gray-900">{total.toLocaleString()} words</div>
            {work.targetWords ? <Meter value={total} target={work.targetWords} label="Work target" /> : null}
            <Field key={`work:${work.id}`} label="Word target" className="mt-2" placeholder="For the whole work" value={work.targetWords ? String(work.targetWords) : ''} onSave={(value) => void save({ targetWords: parseWordTarget(value) })} />
          </section>
          <p className="text-xs text-gray-500">Set a target for a single scene or chapter in its Notes tab.</p>
        </div>
      )}
    </div>
  )
}
