'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MORSE } from '@/data/radio-bands'
import { localDate, advanceStreak } from '@/lib/streak'
import { notifyPracticed } from '@/components/DailyDot'
import type { LetterAccuracy } from '@/db/schema/janki'

// ── Confetti ──────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = ['#4ade80','#facc15','#60a5fa','#f472b6','#a78bfa','#fb923c']

interface ConfettiParticle {
  id:    number
  x:     number   // vw %
  delay: number   // ms
  dur:   number   // ms
  color: string
  size:  number
  angle: number
}

function Confetti({ active }: { active: boolean }) {
  const particles = useMemo<ConfettiParticle[]>(() =>
    Array.from({ length: 72 }, (_, i) => ({
      id:    i,
      x:     Math.random() * 100,
      delay: Math.random() * 800,
      dur:   1400 + Math.random() * 1000,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size:  6 + Math.random() * 7,
      angle: Math.random() * 360,
    })), [])

  if (!active) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position:        'absolute',
            left:            `${p.x}vw`,
            top:             '-20px',
            width:           `${p.size}px`,
            height:          `${p.size}px`,
            backgroundColor: p.color,
            borderRadius:    p.id % 3 === 0 ? '50%' : '2px',
            transform:       `rotate(${p.angle}deg)`,
            animation:       `confetti-fall ${p.dur}ms ${p.delay}ms ease-in forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0)    rotate(0deg)   opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ── Koch order (LCWO standard, letters + numbers first) ───────────────────────
const KOCH_ORDER = [
  'K','M','R','S','U','A','P','T','L','O',
  'W','I','N','J','E','F','Y','V','G','Z',
  'Q','H','0','9','8','7','6','5','4','3','2','1',
  'B','D','X','C',
]

// ── Persistence ───────────────────────────────────────────────────────────────
// The account (Postgres) is authoritative; localStorage is an offline mirror.
//
// It used to be localStorage alone, which lost progress two ways: clearing site
// data wiped it outright, and localStorage is per-origin, so reaching the
// trainer on the LAN address got you a second, empty history. Signed out the
// mirror still carries the session, and the first sign-in seeds the account
// from it once.

const LS_KEY = 'morse_trainer_v1'

interface SavedState {
  kochLevel:      number
  streak:         { lastDate: string; count: number }
  letterAccuracy: Record<string, LetterAccuracy>
  /** Hand-picked drill set. Empty = ordinary Koch level practice. */
  focusChars:     string[]
  /** Recent-miss weight per char, see `nextWeakness`. Mirror only, like
   *  focusChars — it's a picking hint, not history the account must keep. */
  weakness:       Record<string, number>
}

interface RemoteState {
  signedIn: boolean
  progress: { kochLevel: number; letterAccuracy: Record<string, LetterAccuracy> } | null
  streak:   { count: number; longest: number; lastDate: string } | null
}

const EMPTY: SavedState = {
  kochLevel: 0, streak: { lastDate: '', count: 0 }, letterAccuracy: {}, focusChars: [],
  weakness: {},
}

function loadSaved(): SavedState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...EMPTY, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return EMPTY
}

function saveSaved(s: SavedState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

/** Never throws: the trainer must keep working with the API unreachable. */
async function fetchRemote(): Promise<RemoteState | null> {
  try {
    const res = await fetch('/api/morse/progress')
    return res.ok ? await res.json() as RemoteState : null
  } catch { return null }
}

async function pushRemote(payload: Record<string, unknown>): Promise<RemoteState | null> {
  try {
    const res = await fetch('/api/morse/progress', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    return res.ok ? await res.json() as RemoteState : null
  } catch { return null }
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

/** Play one Morse character. Returns duration in ms. */
function playCharAudio(
  char: string,
  ctx:  AudioContext,
  charWPM: number,
  pitchHz: number,
): number {
  const code = MORSE[char.toUpperCase()]
  if (!code || code === ' ') return 0
  const dit = 1200 / charWPM / 1000   // in seconds
  let t = ctx.currentTime + 0.03

  for (let i = 0; i < code.length; i++) {
    const dur = code[i] === '.' ? dit : dit * 3
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = pitchHz
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.35, t + 0.005)
    gain.gain.setValueAtTime(0.35, t + dur - 0.005)
    gain.gain.linearRampToValueAtTime(0, t + dur)
    osc.start(t)
    osc.stop(t + dur + 0.01)
    t += dur
    if (i < code.length - 1) t += dit  // inter-symbol gap
  }
  return (t - ctx.currentTime) * 1000
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ── Character picker — Koch-weighted ─────────────────────────────────────────
// Newest char in level: 35%, second newest: 20%, rest: split evenly

/** Longest run of one char a focus drill will produce before forcing a change. */
const MAX_RUN = 3

function pickChar(
  level:  number,
  focus:  string[],
  last:   string | null,
  runLen: number,
  weak:   Record<string, number> = {},
): string {
  // A focus drill is a flat pool: the point is repeated exposure to the two or
  // three sounds you keep swapping, so Koch's newest-char weighting doesn't
  // apply — it's a uniform coin flip, and it has to stay one. Banning a repeat
  // outright looks like a fair guard but isn't: on a two-char pool it leaves a
  // single legal choice, so K/R becomes K R K R and you answer the pattern
  // instead of the sound. The only guard is a run cap, which bites rarely
  // enough (1 in 8 for a pair) to leave the next char genuinely unguessable.
  if (focus.length > 0) {
    const choices = focus.length > 1 && last && runLen >= MAX_RUN
      ? focus.filter(c => c !== last)
      : focus
    return choices[Math.floor(Math.random() * choices.length)]
  }

  const pool = KOCH_ORDER.slice(0, level + 2)
  const n = pool.length
  // Letters you've been missing come up more, on top of the Koch weighting.
  const weights = pool.map((c, i) =>
    (i === n - 1 ? 3.5 : i === n - 2 ? 2 : 1) * (1 + (weak[c] ?? 0))
  )
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[n - 1]
}

// ── Re-drill ─────────────────────────────────────────────────────────────────
// Miss a letter and it plays again, and only it, until you've caught it
// `need` times running; then the session returns to random. Drill draws are
// predictable by design, so they're tallied apart from the score.

interface Repair {
  ch:     string
  /** Consecutive catches since the last miss. */
  streak: number
}

// ── Weakness ─────────────────────────────────────────────────────────────────
// A miss adds weight to a letter's random draws; each catch in a random draw
// takes a quarter of it away. Catches during a re-drill don't count — you
// knew what was coming — so the weight lingers until you get it cold.

const WEAK_CAP   = 4
const WEAK_DECAY = 0.75

function nextWeakness(w: number, hit: boolean, drill: boolean): number {
  if (!hit) return Math.min(WEAK_CAP, w + 1)
  if (drill) return w
  const d = w * WEAK_DECAY
  return d < 0.05 ? 0 : d
}

// ── Confusable pairs ─────────────────────────────────────────────────────────
// The sounds that swap for each other most often: one is the other's mirror,
// prefix, or one element longer.
const CONFUSABLE_PAIRS: string[][] = [
  ['K','R'], ['E','I'], ['I','S'], ['S','H'], ['U','V'],
  ['A','N'], ['D','B'], ['F','L'], ['G','Q'], ['M','O'],
]

// ── Types ─────────────────────────────────────────────────────────────────────

type SessionMode  = 'active' | 'flow'
type SessionPhase = 'idle' | 'running' | 'done'
type Feedback     = 'correct' | 'wrong' | 'missed' | 'late' | null

interface SessionResult {
  hits:         number
  total:        number
  missed:       Record<string, number>  // char → miss count
  attempts:     Record<string, number>  // char → times played
  pool:         string[]                // chars this session could draw from
  focused:      boolean
  mode:         SessionMode
  autoAdvanced: boolean
  newLevel:     number
  /** Set when "wait for my answer" was on: right answers that came after the
   *  timed session's deadline, so they scored as misses. */
  late:         number | null
  /** Set when re-drill was on. Drill draws are kept out of hits/total so the
   *  score (and promotion) still measures random recall at speed. */
  drill:        { hits: number; total: number; cleared: string[]; open: string[] } | null
  /** Wrong keys pressed, worst first: `ch` was played, `as` was typed. */
  confusions:   { ch: string; as: string; n: number }[]
}

// ── Main component ────────────────────────────────────────────────────────────

export function MorseTrainer() {
  // Persisted state
  const [kochLevel,      setKochLevel]      = useState(0)
  const [streak,         setStreak]         = useState({ lastDate: '', count: 0 })
  const [longestStreak,  setLongestStreak]  = useState(0)
  const [letterAccuracy, setLetterAccuracy] = useState<Record<string, LetterAccuracy>>({})
  const [focusChars,     setFocusChars]     = useState<string[]>([])
  const [weakness,       setWeakness]       = useState<Record<string, number>>({})
  // Ref, not state: runSession is memoized and would otherwise capture a stale
  // value and silently skip the write to the account.
  const signedInRef = useRef(false)

  // Session config
  const [mode,         setMode]        = useState<SessionMode>('active')
  const [duration,     setDuration]    = useState(60)    // seconds
  const [customMin,    setCustomMin]   = useState(5)     // custom duration in minutes
  const [charWPM,      setCharWPM]     = useState(20)    // character speed
  const [effectiveWPM, setEffWPM]      = useState(5)     // Farnsworth spacing
  const [pitch,        setPitch]       = useState(650)   // Hz
  // Active mode only: no timeout — the next char plays once you've answered.
  const [waitForAnswer, setWaitForAnswer] = useState(false)
  // Active mode only: a missed letter keeps coming back until caught N in a row.
  const [redrill,      setRedrill]     = useState(true)
  const [redrillNeed,  setRedrillNeed] = useState(5)

  // Session runtime
  const [phase,        setPhase]       = useState<SessionPhase>('idle')
  const [currentChar,  setCurrentChar] = useState<string | null>(null)
  const [feedback,     setFeedback]    = useState<Feedback>(null)
  const [elapsed,      setElapsed]     = useState(0)
  const [hits,         setHits]        = useState(0)
  const [total,        setTotal]       = useState(0)
  const [late,         setLate]        = useState(0)
  const [recentTape,   setRecentTape]  = useState<{ ch: string; ok: boolean; drill?: boolean }[]>([])
  const [repairView,   setRepairView]  = useState<{ ch: string; streak: number } | null>(null)
  const [drillCount,   setDrillCount]  = useState({ hits: 0, total: 0 })

  // Session result (shown after done)
  const [result,       setResult]      = useState<SessionResult | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [countdown,    setCountdown]   = useState<number | null>(null)

  // Refs
  const cancelRef     = useRef(false)
  const keyResolveRef = useRef<((key: string) => void) | null>(null)
  const audioCtxRef   = useRef<AudioContext | null>(null)
  const missesRef     = useRef<Record<string, number>>({})
  // Real per-char attempt counts. The heatmap used to divide the session total
  // by the pool size, which is only ever approximately right and is plainly
  // wrong for a weighted or hand-picked pool.
  const attemptsRef   = useRef<Record<string, number>>({})
  const hitsRef       = useRef(0)
  const totalRef      = useRef(0)
  const lateRef       = useRef(0)
  const drillRef      = useRef({ hits: 0, total: 0 })
  const confusionsRef = useRef<Record<string, Record<string, number>>>({})

  // ── Load: mirror first for an instant paint, then reconcile with the account
  useEffect(() => {
    const local = loadSaved()
    setKochLevel(local.kochLevel)
    setStreak(local.streak)
    setLetterAccuracy(local.letterAccuracy)
    setFocusChars(local.focusChars ?? [])
    setWeakness(local.weakness ?? {})

    let cancelled = false
    void (async () => {
      const remote = await fetchRemote()
      if (cancelled || !remote?.signedIn) return
      signedInRef.current = true

      if (remote.progress) {
        // The account wins. It survives a browser wipe and is the same whether
        // you came in on localhost or the LAN address.
        const merged: SavedState = {
          kochLevel:      remote.progress.kochLevel,
          letterAccuracy: remote.progress.letterAccuracy,
          streak: {
            lastDate: remote.streak?.lastDate ?? '',
            count:    remote.streak?.count ?? 0,
          },
          focusChars: local.focusChars ?? [],
          weakness:   local.weakness ?? {},
        }
        setKochLevel(merged.kochLevel)
        setLetterAccuracy(merged.letterAccuracy)
        setStreak(merged.streak)
        setLongestStreak(remote.streak?.longest ?? 0)
        saveSaved(merged)
      } else {
        // Nothing stored for this account yet — adopt what this browser has
        // been carrying. Seeding is refused server-side if a row already
        // exists, so this can't clobber real history.
        const seeded = await pushRemote({
          seed:           true,
          kochLevel:      local.kochLevel,
          letterAccuracy: local.letterAccuracy,
          seedStreak:     local.streak,
          localDate:      localDate(),
        })
        if (cancelled || !seeded?.streak) return
        setStreak({ lastDate: seeded.streak.lastDate, count: seeded.streak.count })
        setLongestStreak(seeded.streak.longest)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Write through to the mirror, and to the account when signed in ───────
  const persist = (next: SavedState, practiced: boolean) => {
    saveSaved(next)
    if (!signedInRef.current) return
    void pushRemote({
      kochLevel:      next.kochLevel,
      letterAccuracy: next.letterAccuracy,
      localDate:      localDate(),
      practiced,
    }).then((res) => {
      // The server owns the streak arithmetic, so its answer replaces the
      // optimistic local one rather than sitting alongside it.
      if (!res?.streak) return
      if (practiced) notifyPracticed()
      setStreak({ lastDate: res.streak.lastDate, count: res.streak.count })
      setLongestStreak(res.streak.longest)
    })
  }

  // ── Keydown listener ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const k = e.key.toUpperCase()
      if (/^[A-Z0-9.,?/]$/.test(k) && keyResolveRef.current) {
        const fn = keyResolveRef.current
        keyResolveRef.current = null
        fn(k)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const waitForKey = useCallback((): Promise<string> =>
    new Promise(res => { keyResolveRef.current = res }), [])

  // ── Thinking time (Farnsworth inter-char gap) ───────────────────────────
  const thinkingMs = () =>
    Math.max(300, Math.round(1200 / effectiveWPM * 2.8))

  // ── Session loop ────────────────────────────────────────────────────────
  const runSession = useCallback(async () => {
    cancelRef.current = false
    hitsRef.current     = 0
    totalRef.current    = 0
    lateRef.current     = 0
    missesRef.current   = {}
    attemptsRef.current = {}
    drillRef.current    = { hits: 0, total: 0 }
    confusionsRef.current = {}
    setHits(0); setTotal(0); setLate(0); setElapsed(0)
    setDrillCount({ hits: 0, total: 0 })
    setRepairView(null)
    setRecentTape([])
    setResult(null)
    setPhase('running')

    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    audioCtxRef.current = ctx
    if (ctx.state === 'suspended') await ctx.resume()

    const startMs = Date.now()

    const tick = setInterval(() => {
      setElapsed(Math.min(1, (Date.now() - startMs) / (duration * 1000)))
    }, 250)

    let last: string | null = null
    let runLen = 0
    const drilling = mode === 'active' && redrill
    let repair: Repair | null = null
    const cleared: string[] = []
    const weak = { ...weakness }

    while (!cancelRef.current && (Date.now() - startMs) < duration * 1000) {
      const drill = repair !== null
      const ch: string = repair ? repair.ch : pickChar(kochLevel, focusChars, last, runLen, weak)
      runLen = ch === last ? runLen + 1 : 1
      last = ch
      setCurrentChar('?')
      setFeedback(null)

      // Play the character
      const audioDur = playCharAudio(ch, ctx, charWPM, pitch)
      await sleep(audioDur + 30)  // wait for audio to end

      if (cancelRef.current) break

      if (mode === 'active') {
        // ── Active mode: wait for key ────────────────────────────────
        setCurrentChar('?')
        const askedAt = Date.now()
        const pressed = waitForAnswer
          ? await waitForKey()
          : await Promise.race([
              waitForKey(),
              sleep(thinkingMs()).then(() => '__timeout__'),
            ])

        // Stopped while waiting — the char was never answered, so don't score it.
        if (pressed === '__stop__') break

        // Without a timeout, a right answer still has to beat the deadline the
        // timed session would have set — otherwise it's a miss, same as there.
        const isRight  = pressed !== '__timeout__' && pressed.toUpperCase() === ch.toUpperCase()
        const isLate   = waitForAnswer && isRight && Date.now() - askedAt > thinkingMs()
        const isHit    = isRight && !isLate
        const isMissed = pressed === '__timeout__'
        const isWrong  = !isRight && !isMissed

        // Update stats. Drill draws are skewed towards your weak letters, so
        // they're tallied apart — the score stays a fair random sample.
        if (drill) {
          drillRef.current = {
            hits:  drillRef.current.hits + (isHit ? 1 : 0),
            total: drillRef.current.total + 1,
          }
          setDrillCount(drillRef.current)
        } else {
          if (isLate) { lateRef.current += 1; setLate(lateRef.current) }
          hitsRef.current  += isHit ? 1 : 0
          totalRef.current += 1
          setHits(hitsRef.current)
          setTotal(totalRef.current)
        }
        // Per-letter accuracy takes every draw: a drilled letter's history
        // should include the drilling.
        attemptsRef.current[ch] = (attemptsRef.current[ch] ?? 0) + 1
        if (!isHit) missesRef.current[ch] = (missesRef.current[ch] ?? 0) + 1
        if (isWrong) {
          const row = confusionsRef.current[ch] ??= {}
          row[pressed] = (row[pressed] ?? 0) + 1
        }

        weak[ch] = nextWeakness(weak[ch] ?? 0, isHit, drill)

        if (drilling) {
          if (!repair) {
            if (!isHit) repair = { ch, streak: 0 }
          } else if (isHit) {
            repair.streak += 1
            if (repair.streak >= redrillNeed) { cleared.push(repair.ch); repair = null }
          } else {
            repair.streak = 0
          }
          setRepairView(repair ? { ...repair } : null)
        }

        // Show feedback
        const fb: Feedback = isHit ? 'correct' : isLate ? 'late' : isMissed ? 'missed' : 'wrong'
        setFeedback(fb)
        setCurrentChar(ch)  // reveal correct char
        setRecentTape(t => [...t.slice(-14), { ch, ok: isHit, drill }])

        await sleep(isMissed || isLate ? 450 : 280)

      } else {
        // ── Flow mode: reveal char, no scoring ───────────────────────
        setCurrentChar(ch)
        setFeedback('correct')
        setRecentTape(t => [...t.slice(-14), { ch, ok: true }])
        await sleep(thinkingMs())
      }

      setCurrentChar(null)
      setFeedback(null)
      await sleep(80)
    }

    clearInterval(tick)
    setElapsed(1)
    keyResolveRef.current = null  // cancel any pending wait
    await ctx.close()

    // ── Persist results ──────────────────────────────────────────────
    const acc = hitsRef.current / (totalRef.current || 1)
    const td  = localDate()

    // Streak — optimistic, so the number moves the moment the session ends.
    // If we're signed in, `persist` below replaces it with the server's answer.
    const advanced = advanceStreak(
      { streakCount: streak.count, longestStreak, lastStudyDate: streak.lastDate },
      td,
    )
    const newStreak = { lastDate: advanced.lastStudyDate, count: advanced.streakCount }
    setStreak(newStreak)
    setLongestStreak(advanced.longestStreak)

    // Letter accuracy (active only)
    const newAcc = { ...letterAccuracy }
    if (mode === 'active') {
      for (const [ch, attempts] of Object.entries(attemptsRef.current)) {
        const misses = missesRef.current[ch] ?? 0
        const prev   = newAcc[ch] ?? { hits: 0, total: 0 }
        newAcc[ch] = { hits: prev.hits + (attempts - misses), total: prev.total + attempts }
      }
      setLetterAccuracy(newAcc)
      setWeakness(weak)
    }

    // Auto-advance level if active session hit 80% threshold. Late answers in
    // "wait for my answer" are already misses, so the bar is the timed one.
    // A focus drill is deliberately not a level test — 90% on two letters you
    // chose says nothing about the rest of the level, so it can't promote you.
    const autoAdvanced =
      mode === 'active' &&
      focusChars.length === 0 &&
      totalRef.current >= 10 &&
      acc >= 0.8 &&
      kochLevel < KOCH_ORDER.length - 2
    const finalLevel = autoAdvanced ? kochLevel + 1 : kochLevel
    if (autoAdvanced) {
      setKochLevel(finalLevel)
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 3200)
    }

    // practiced: true — a focus drill is practice, so it moves the day streak
    // exactly like a level session does.
    persist({ kochLevel: finalLevel, streak: newStreak, letterAccuracy: newAcc, focusChars,
             weakness: mode === 'active' ? weak : weakness }, true)

    setResult({
      hits: hitsRef.current, total: totalRef.current,
      missed: { ...missesRef.current }, attempts: { ...attemptsRef.current },
      pool: focusChars.length ? focusChars : KOCH_ORDER.slice(0, kochLevel + 2),
      focused: focusChars.length > 0,
      mode, autoAdvanced, newLevel: finalLevel,
      late: mode === 'active' && waitForAnswer ? lateRef.current : null,
      drill: drilling
        ? { ...drillRef.current, cleared: [...new Set(cleared)], open: repair ? [repair.ch] : [] }
        : null,
      confusions: Object.entries(confusionsRef.current)
        .flatMap(([c, row]) => Object.entries(row).map(([as, n]) => ({ ch: c, as, n })))
        .sort((a, b) => b.n - a.n)
        .slice(0, 4),
    })
    setRepairView(null)
    setPhase('done')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kochLevel, mode, duration, charWPM, pitch, effectiveWPM, waitForAnswer, redrill, redrillNeed, streak, longestStreak, letterAccuracy, focusChars, weakness, waitForKey])

  const startWithCountdown = useCallback(() => {
    setCountdown(3)
    let n = 3
    const iv = setInterval(() => {
      n -= 1
      if (n <= 0) {
        clearInterval(iv)
        setCountdown(null)
        runSession()
      } else {
        setCountdown(n)
      }
    }, 1000)
  }, [runSession])

  const stopSession = () => {
    cancelRef.current = true
    // Release a pending wait rather than dropping it: with "wait for my answer"
    // on there's no timeout to fall back on, so the loop would hang forever.
    const fn = keyResolveRef.current
    keyResolveRef.current = null
    fn?.('__stop__')
  }

  const levelUp = () => {
    const next = Math.min(kochLevel + 1, KOCH_ORDER.length - 2)
    setKochLevel(next)
    // practiced: false — nudging the level is not a practice session.
    persist({ kochLevel: next, streak, letterAccuracy, focusChars, weakness }, false)
    setPhase('idle')
    setResult(null)
  }

  const levelDown = () => {
    const prev = Math.max(kochLevel - 1, 0)
    setKochLevel(prev)
    persist({ kochLevel: prev, streak, letterAccuracy, focusChars, weakness }, false)
    setPhase('idle')
    setResult(null)
  }

  // ── Focus set ───────────────────────────────────────────────────────────
  // Kept in the mirror only: which letters you are drilling today is a local
  // choice, not account history, so it needs no schema change to survive a
  // reload. Written straight through rather than through `persist` — there is
  // nothing here the server wants, and a POST per chip-click would be noise.
  const setFocus = (next: string[]) => {
    setFocusChars(next)
    saveSaved({ kochLevel, streak, letterAccuracy, focusChars: next, weakness })
  }

  const toggleFocus = (ch: string) =>
    setFocus(focusChars.includes(ch)
      ? focusChars.filter(c => c !== ch)
      : [...focusChars, ch])

  // ── Current Koch chars for display ─────────────────────────────────────
  const sessionChars = focusChars.length ? focusChars : KOCH_ORDER.slice(0, kochLevel + 2)
  const currentChars = KOCH_ORDER.slice(0, kochLevel + 2)

  // ── Accuracy % for a char ───────────────────────────────────────────────
  const charAcc = (ch: string): number | null => {
    const a = letterAccuracy[ch]
    if (!a || a.total < 3) return null
    return a.hits / a.total
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const accuracy = total > 0 ? Math.round((hits / total) * 100) : null

  return (
    <>
    <Confetti active={showConfetti} />
    <div className="flex flex-col h-full overflow-hidden bg-gray-950 text-gray-200">

      {/* ── Top bar: streak + level ────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-gray-800 flex-shrink-0">
        {/* Streak */}
        <div className="flex items-center gap-1.5" title={longestStreak > 0 ? `${longestStreak} day best` : undefined}>
          <span className="text-lg">🔥</span>
          <div>
            <div className="text-sm font-bold text-white">{streak.count}</div>
            <div className="text-[9px] text-gray-500 uppercase">day streak</div>
          </div>
        </div>

        <div className="h-8 w-px bg-gray-800" />

        {/* Level */}
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-widest">Koch level</div>
          <div className="text-sm font-bold text-green-400">
            {kochLevel + 1} / {KOCH_ORDER.length - 1}
          </div>
        </div>

        {/* Current char set */}
        <div className="flex-1 min-w-0">
          <div className="text-[9px] uppercase tracking-widest mb-1">
            {focusChars.length ? (
              <span className="text-yellow-500">
                Focus drill ({focusChars.length}) · level paused
              </span>
            ) : (
              <span className="text-gray-600">Working chars ({currentChars.length})</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {sessionChars.map((ch, i) => {
              const acc = charAcc(ch)
              const bg  = acc === null ? '#374151'
                        : acc >= 0.8  ? '#14532d'
                        : acc >= 0.5  ? '#713f12'
                        : '#7f1d1d'
              const isNew = !focusChars.length && i >= sessionChars.length - 2
              return (
                <span key={ch}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                  style={{ backgroundColor: bg,
                           color: focusChars.length ? '#fbbf24' : isNew ? '#4ade80' : '#d1d5db',
                           outline: focusChars.length ? '1px solid #fbbf2466'
                                  : isNew ? '1px solid #4ade8066' : 'none' }}>
                  {ch}
                </span>
              )
            })}
          </div>
        </div>

        {/* Level controls (only in idle) */}
        {phase === 'idle' && (
          <div className="flex gap-1">
            <button onClick={levelDown} disabled={kochLevel === 0}
              className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:text-white
                         disabled:opacity-30">← level</button>
            <button onClick={levelUp} disabled={kochLevel >= KOCH_ORDER.length - 2}
              className="px-2 py-1 rounded text-xs bg-gray-800 text-gray-400 hover:text-white
                         disabled:opacity-30">level →</button>
          </div>
        )}
      </div>

      {/* ── Session result ─────────────────────────────────────────────── */}
      {phase === 'done' && result && (
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-6 space-y-5">

          {result.mode === 'flow' ? (
            <>
              <div className="text-4xl">📻</div>
              <p className="text-lg font-bold text-white">Flow session complete</p>
              <p className="text-sm text-gray-400">Listening builds pattern recognition. Come back tomorrow!</p>
              <div className="text-5xl font-black text-green-400">🔥 {streak.count}</div>
              <p className="text-xs text-gray-500">
                day streak
                {longestStreak > streak.count && ` · ${longestStreak} best`}
                {longestStreak > 0 && longestStreak === streak.count && ' · best ever!'}
              </p>
            </>
          ) : (
            <>
              {/* Accuracy */}
              <div className="text-center">
                <div className={`text-7xl font-black ${
                  result.total === 0 ? 'text-gray-400'
                  : (result.hits / result.total) >= 0.8 ? 'text-green-400'
                  : (result.hits / result.total) >= 0.5 ? 'text-yellow-400'
                  : 'text-red-400'
                }`}>
                  {result.total === 0 ? '—' : Math.round(result.hits / result.total * 100)}
                  {result.total > 0 && <span className="text-3xl">%</span>}
                </div>
                <p className="text-gray-400 text-sm mt-1">
                  {result.hits} of {result.total} caught
                  {result.drill && result.drill.total > 0 && (
                    <span className="text-gray-600"> · random draws only</span>
                  )}
                </p>
                {result.late !== null && result.late > 0 && (
                  <p className="text-orange-400 text-sm mt-1">
                    {result.late} right but too slow — counted as misses
                  </p>
                )}
              </div>

              {result.focused && (
                <div className="bg-yellow-950 border border-yellow-800 rounded-2xl px-5 py-2.5 text-center">
                  <p className="text-yellow-300 text-xs font-semibold">
                    Focus drill · {result.pool.join(' ')}
                  </p>
                  <p className="text-yellow-600/80 text-[10px] mt-0.5">
                    Counted towards your streak. Level unchanged — clear the focus set
                    to go back to promotions.
                  </p>
                </div>
              )}

              {/* Level up / down prompt */}
              {!result.focused && result.total >= 10 && (
                <div className="text-center space-y-2">
                  {result.autoAdvanced && (
                    <div className="bg-green-900 border border-green-700 rounded-2xl px-6 py-3">
                      <p className="text-green-300 font-semibold text-sm mb-1">
                        🎉 Auto-promoted to level {result.newLevel + 1}!
                      </p>
                      <p className="text-green-500 text-xs">
                        New char unlocked:&nbsp;
                        <strong className="text-white font-mono text-lg">{KOCH_ORDER[result.newLevel + 1]}</strong>
                        &nbsp;({MORSE[KOCH_ORDER[result.newLevel + 1]]})
                      </p>
                    </div>
                  )}
                  {!result.autoAdvanced && (result.hits / result.total) >= 0.8 &&
                   result.newLevel >= KOCH_ORDER.length - 2 && (
                    <p className="text-green-400 font-bold">All Koch levels complete! You&apos;re exam-ready. 🎉</p>
                  )}
                  {(result.hits / result.total) < 0.5 && (
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl px-6 py-3 text-center">
                      <p className="text-gray-300 text-sm mb-2">Below 50% — keep drilling these sounds.</p>
                      {result.newLevel > 0 && (
                        <button onClick={levelDown}
                          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs">
                          ← Drop back a level
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Letter heatmap */}
              <div className="w-full max-w-sm">
                <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 text-center">
                  Letter heatmap (this session)
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {result.pool.map(ch => {
                    const total_c = result.attempts[ch] ?? 0
                    const missed  = result.missed[ch] ?? 0
                    // Never played this session — grey, not a scored zero.
                    const acc_c   = total_c === 0 ? null : Math.max(0, 1 - missed / total_c)
                    const col = acc_c === null ? '#1f2937'
                              : acc_c > 0.8 ? '#14532d' : acc_c > 0.5 ? '#713f12' : '#7f1d1d'
                    const txt = acc_c === null ? '#6b7280'
                              : acc_c > 0.8 ? '#4ade80' : acc_c > 0.5 ? '#fbbf24' : '#f87171'
                    return (
                      <div key={ch} className="flex flex-col items-center rounded-lg px-2 py-1.5 min-w-[32px]"
                        title={total_c ? `${total_c - missed}/${total_c}` : 'not played'}
                        style={{ backgroundColor: col }}>
                        <span className="text-sm font-bold font-mono" style={{ color: txt }}>{ch}</span>
                        <span className="text-[8px]" style={{ color: txt }}>
                          {acc_c === null ? '–' : `${Math.round(acc_c * 100)}%`}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Re-drill summary */}
              {result.drill && (result.drill.cleared.length > 0 || result.drill.open.length > 0) && (
                <div className="w-full max-w-sm bg-purple-950/60 border border-purple-900 rounded-2xl px-4 py-3 space-y-1.5">
                  <p className="text-[9px] text-purple-400 uppercase tracking-widest">
                    Re-drill · {result.drill.hits}/{result.drill.total} extra (not in the score)
                  </p>
                  {result.drill.cleared.length > 0 && (
                    <p className="text-xs text-purple-200">
                      Fixed: <span className="font-mono font-bold">{result.drill.cleared.join(' ')}</span>
                    </p>
                  )}
                  {result.drill.open.length > 0 && (
                    <p className="text-xs text-purple-300/70">
                      Still open when time ran out:{' '}
                      <span className="font-mono font-bold text-purple-200">{result.drill.open.join(' ')}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Confusions — the pairs your ear is splitting, one click to drill */}
              {result.confusions.length > 0 && (
                <div className="w-full max-w-sm">
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-2 text-center">
                    Heard as
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {result.confusions.map(c => (
                      <button key={c.ch + c.as}
                        onClick={() => { setFocus([c.ch, c.as]); setPhase('idle'); setResult(null) }}
                        title={`Drill ${c.ch} / ${c.as}`}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-900 hover:bg-yellow-900 text-xs font-mono">
                        <span className="text-white font-bold">{c.ch}</span>
                        <span className="text-gray-600">{MORSE[c.ch]}</span>
                        <span className="text-gray-500">→</span>
                        <span className="text-red-400 font-bold">{c.as}</span>
                        <span className="text-gray-600">{MORSE[c.as] ?? ''}</span>
                        <span className="text-gray-500">×{c.n}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-600 text-center mt-1.5">Click a pair to make it your focus drill</p>
                </div>
              )}
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={() => { setPhase('idle'); setResult(null) }}
              className="px-5 py-2 rounded-xl bg-gray-800 text-gray-300 hover:text-white text-sm font-semibold">
              Back
            </button>
            <button onClick={runSession}
              className="px-5 py-2 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-semibold">
              Again →
            </button>
          </div>
        </div>
      )}

      {/* ── Running session ─────────────────────────────────────────────── */}
      {phase === 'running' && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Session progress bar */}
          <div className="h-1 bg-gray-800 flex-shrink-0">
            <div className="h-full bg-green-500 transition-all duration-250"
              style={{ width: `${elapsed * 100}%` }} />
          </div>

          {/* Hit counter + mode tag */}
          <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                mode === 'active' ? 'bg-green-900 text-green-300' : 'bg-blue-900 text-blue-300'}`}>
                {mode === 'active' ? 'Active' : 'Flow'}
              </span>
              {focusChars.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded font-semibold bg-yellow-900 text-yellow-300 font-mono">
                  {focusChars.join(' ')}
                </span>
              )}
              <span className="text-[10px] text-gray-600 font-mono">{charWPM} WPM char</span>
              {mode === 'active' && waitForAnswer && (
                <span className="text-[10px] text-gray-600">· waits for you</span>
              )}
            </div>
            {mode === 'active' && total > 0 && (
              <div className="font-mono text-sm">
                <span className="text-green-400 font-bold">{hits}</span>
                <span className="text-gray-600"> / {total}</span>
                <span className="text-gray-500 text-xs ml-2">{accuracy}%</span>
                {waitForAnswer && late > 0 && (
                  <span className="text-orange-400 text-xs ml-2">{late} late</span>
                )}
                {drillCount.total > 0 && (
                  <span className="text-purple-400 text-xs ml-2"
                    title="Re-drill answers — not in the score">
                    +{drillCount.hits}/{drillCount.total} drill
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Re-drill status — always the same height so the letter doesn't jump */}
          {mode === 'active' && redrill && (
            <div className="h-7 flex items-center justify-center flex-shrink-0">
              {repairView && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950 border border-purple-800">
                  <span className="text-[10px] text-purple-400 uppercase tracking-widest">Re-drilling</span>
                  <span className="text-sm font-mono font-bold text-purple-200">{repairView.ch}</span>
                  <span className="text-[10px] font-mono text-purple-500">{MORSE[repairView.ch]}</span>
                  <span className="flex gap-0.5">
                    {Array.from({ length: redrillNeed }, (_, i) => (
                      <span key={i} className={`w-2 h-2 rounded-full ${
                        i < repairView.streak ? 'bg-purple-400' : 'bg-purple-900'}`} />
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Main character display */}
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">

            {/* The big character */}
            <div className={`text-[140px] font-black font-mono leading-none transition-all duration-150 select-none ${
              feedback === 'correct' ? 'text-green-400'
              : feedback === 'wrong'   ? 'text-red-400'
              : feedback === 'missed'  ? 'text-yellow-500'
              : feedback === 'late'    ? 'text-orange-400'
              : 'text-gray-300'
            }`}
            style={{
              textShadow: feedback === 'correct' ? '0 0 40px #4ade8088'
                        : feedback === 'wrong'   ? '0 0 40px #f8717188'
                        : feedback === 'missed'  ? '0 0 40px #fbbf2488'
                        : feedback === 'late'    ? '0 0 40px #fb923c88'
                        : 'none',
            }}>
              {currentChar ?? (mode === 'active' ? ' ' : '·')}
            </div>

            {/* Feedback label */}
            {mode === 'active' && (
              <div className="h-5 text-xs font-semibold">
                {feedback === 'correct' && <span className="text-green-400">✓ correct</span>}
                {feedback === 'wrong'   && <span className="text-red-400">✗ wrong</span>}
                {feedback === 'missed'  && <span className="text-yellow-500">— missed</span>}
                {feedback === 'late'    && <span className="text-orange-400">✓ right, but too slow</span>}
                {!feedback && currentChar === '?' && (
                  <span className="text-gray-600 animate-pulse">listening…</span>
                )}
              </div>
            )}

            {/* Recent tape (last 15 chars) */}
            <div className="flex gap-1 flex-wrap justify-center max-w-xs">
              {recentTape.map((item, i) => (
                <span key={i}
                  className="w-6 h-6 flex items-center justify-center rounded text-xs font-mono font-bold"
                  style={{
                    backgroundColor: item.ok ? '#14532d' : '#7f1d1d',
                    color:           item.ok ? '#4ade80' : '#f87171',
                    opacity:         0.4 + 0.6 * ((i + 1) / recentTape.length),
                    boxShadow:       item.drill ? 'inset 0 -2px 0 #a78bfa' : undefined,
                  }}
                  title={item.drill ? 're-drill' : undefined}>
                  {item.ch}
                </span>
              ))}
            </div>

            {mode === 'active' && (
              <p className="text-[10px] text-gray-700 text-center">
                Just press the key — no Enter needed
                {waitForAnswer && ' · the next letter waits for you'}
              </p>
            )}
          </div>

          {/* Stop button */}
          <div className="flex justify-center py-4 flex-shrink-0">
            <button onClick={stopSession}
              className="px-5 py-2 rounded-xl bg-gray-800 text-gray-400 hover:text-white text-sm">
              Stop session
            </button>
          </div>
        </div>
      )}

      {/* ── Idle: config ────────────────────────────────────────────────── */}
      {phase === 'idle' && (
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

          {/* Mode toggle */}
          <div>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Mode</p>
            <div className="flex gap-2">
              {([
                { id: 'active' as const,
                  label: 'Active', icon: '⌨',
                  desc: 'Hear a char, press the key. Instant flash. No miss-pile noise.' },
                { id: 'flow'   as const,
                  label: 'Flow',   icon: '〜',
                  desc: 'Continuous stream, char fades in after playing. Zero pressure.' },
              ] as { id: SessionMode; label: string; icon: string; desc: string }[]).map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`flex-1 rounded-2xl border p-4 text-left transition-all ${
                    mode === m.id
                      ? 'border-green-600 bg-green-950'
                      : 'border-gray-800 bg-gray-900 hover:border-gray-600'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{m.icon}</span>
                    <span className={`text-sm font-bold ${mode === m.id ? 'text-green-300' : 'text-white'}`}>
                      {m.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-snug">{m.desc}</p>
                </button>
              ))}
            </div>

            {mode === 'active' && (
              <button onClick={() => setWaitForAnswer(w => !w)}
                className={`mt-2 w-full flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition-colors ${
                  waitForAnswer
                    ? 'border-green-600 bg-green-950'
                    : 'border-gray-800 bg-gray-900 hover:border-gray-600'}`}>
                <span className={`w-8 h-4 rounded-full relative flex-shrink-0 transition-colors ${
                  waitForAnswer ? 'bg-green-500' : 'bg-gray-700'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                    waitForAnswer ? 'left-4' : 'left-0.5'}`} />
                </span>
                <span>
                  <span className={`block text-sm font-bold ${waitForAnswer ? 'text-green-300' : 'text-white'}`}>
                    Wait for my answer
                  </span>
                  <span className="block text-[10px] text-gray-500 leading-snug">
                    No timeout — the next letter plays only after you press a key.
                    A right answer still has to come within{' '}
                    {(Math.max(300, Math.round(1200 / effectiveWPM * 2.8)) / 1000).toFixed(1)}s
                    (your Farnsworth {effectiveWPM} WPM) or it counts as a miss, same as timed.
                  </span>
                </span>
              </button>
            )}

            {mode === 'active' && (
              <div className={`mt-2 w-full flex items-center gap-3 rounded-2xl border px-4 py-2.5 transition-colors ${
                redrill
                  ? 'border-purple-600 bg-purple-950'
                  : 'border-gray-800 bg-gray-900 hover:border-gray-600'}`}>
                <button onClick={() => setRedrill(r => !r)} className="flex items-center gap-3 flex-1 text-left">
                  <span className={`w-8 h-4 rounded-full relative flex-shrink-0 transition-colors ${
                    redrill ? 'bg-purple-500' : 'bg-gray-700'}`}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                      redrill ? 'left-4' : 'left-0.5'}`} />
                  </span>
                  <span>
                    <span className={`block text-sm font-bold ${redrill ? 'text-purple-300' : 'text-white'}`}>
                      Re-drill my misses
                    </span>
                    <span className="block text-[10px] text-gray-500 leading-snug">
                      Miss a letter and it plays again, and only it, until you catch it{' '}
                      {redrillNeed} times running. Then it&apos;s back to random — with your
                      recent misses coming up more often until you get them cold. Drill
                      draws don&apos;t count towards the score or promotion.
                    </span>
                  </span>
                </button>
                {redrill && (
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <span className="text-[8px] text-purple-400 uppercase tracking-widest">in a row</span>
                    <div className="flex gap-1">
                      {[3, 5, 8].map(n => (
                        <button key={n} onClick={() => setRedrillNeed(n)}
                          className={`w-6 h-6 rounded-md text-xs font-bold ${
                            redrillNeed === n ? 'bg-purple-600 text-white'
                                              : 'bg-gray-900 text-gray-500 hover:text-white'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Focus letters */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] text-gray-500 uppercase tracking-widest">
                Focus letters {focusChars.length > 0 && (
                  <span className="text-yellow-500">· drilling {focusChars.join(' ')}</span>
                )}
              </p>
              {focusChars.length > 0 && (
                <button onClick={() => setFocus([])}
                  className="text-[10px] text-gray-500 hover:text-white underline underline-offset-2">
                  clear · back to level {kochLevel + 1}
                </button>
              )}
            </div>

            <p className="text-[10px] text-gray-600 mb-2 leading-snug">
              Pick the sounds you keep swapping and the session plays only those.
              It still counts towards your day streak — it just won&apos;t promote
              you a level.
            </p>

            {/* Pair shortcuts */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {CONFUSABLE_PAIRS.map(pair => {
                const on = pair.length === focusChars.length &&
                           pair.every(c => focusChars.includes(c))
                return (
                  <button key={pair.join('')} onClick={() => setFocus(on ? [] : [...pair])}
                    className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors ${
                      on ? 'bg-yellow-700 text-white'
                         : 'bg-gray-900 text-gray-500 hover:text-white'}`}>
                    {pair.join(' / ')}
                  </button>
                )
              })}
            </div>

            {/* Every char, in Koch order */}
            <div className="flex flex-wrap gap-1">
              {KOCH_ORDER.map((ch, i) => {
                const on      = focusChars.includes(ch)
                const learned = i < kochLevel + 2
                return (
                  <button key={ch} onClick={() => toggleFocus(ch)}
                    title={MORSE[ch]}
                    className={`w-9 rounded-lg py-1 flex flex-col items-center transition-colors ${
                      on      ? 'bg-yellow-700 text-white'
                      : learned ? 'bg-gray-900 text-gray-300 hover:bg-gray-800'
                                : 'bg-gray-900/50 text-gray-600 hover:bg-gray-800'}`}>
                    <span className="text-xs font-mono font-bold leading-none">{ch}</span>
                    <span className={`text-[7px] font-mono leading-none mt-0.5 ${
                      on ? 'text-yellow-200' : 'text-gray-600'}`}>
                      {MORSE[ch]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Session length */}
          <div>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">
              Session length
            </p>
            <div className="flex gap-2 flex-wrap items-center">
              {[60, 90, 120].map(s => (
                <button key={s} onClick={() => setDuration(s)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    duration === s
                      ? 'bg-green-700 text-white'
                      : 'bg-gray-900 text-gray-400 hover:text-white'}`}>
                  {s / 60} min
                </button>
              ))}
              {/* Custom */}
              <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 border transition-colors ${
                ![60, 90, 120].includes(duration)
                  ? 'border-green-600 bg-green-950'
                  : 'border-gray-800 bg-gray-900'}`}>
                <input
                  type="number" min={1} max={60} value={customMin}
                  onChange={e => {
                    const v = Math.max(1, Math.min(60, +e.target.value || 1))
                    setCustomMin(v)
                    setDuration(v * 60)
                  }}
                  className="w-10 bg-transparent text-sm font-semibold text-center
                             text-white focus:outline-none [appearance:textfield]
                             [&::-webkit-outer-spin-button]:appearance-none
                             [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-xs text-gray-400">min</span>
              </div>
            </div>
          </div>

          {/* WPM settings */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: `Character speed: ${charWPM} WPM`,
                sub: 'Koch method — always at full speed',
                val: charWPM, set: setCharWPM, min: 15, max: 25, step: 1,
                color: 'accent-green-400' },
              { label: `Farnsworth gap: ${effectiveWPM} WPM`,
                sub: 'Thinking time between characters',
                val: effectiveWPM, set: setEffWPM, min: 5, max: Math.min(charWPM, 15), step: 1,
                color: 'accent-blue-400' },
            ].map(s => (
              <div key={s.label}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-gray-300 font-semibold">{s.label}</span>
                </div>
                <p className="text-[9px] text-gray-600 mb-1">{s.sub}</p>
                <input type="range" min={s.min} max={s.max} step={s.step} value={s.val}
                  onChange={e => s.set(+e.target.value)}
                  className={`w-full ${s.color}`} />
              </div>
            ))}
          </div>

          {/* Pitch */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-300 font-semibold">Pitch: {pitch} Hz</span>
            </div>
            <input type="range" min={400} max={900} step={10} value={pitch}
              onChange={e => setPitch(+e.target.value)}
              className="w-full accent-yellow-400" />
          </div>

          {/* Koch info */}
          <div className="bg-gray-900 rounded-2xl p-4 text-[10px] text-gray-500 space-y-1.5">
            <p className="font-semibold text-gray-400">Koch Method — how it works</p>
            <p>Characters always play at your character WPM (currently {charWPM}). Only the spacing between chars is stretched (Farnsworth). Your brain learns the sound pattern, not dot-counting.</p>
            <p>Reach <span className="text-green-400 font-semibold">80% accuracy</span> in an Active session to unlock the next character. Focus drills are exempt — they keep your streak alive without moving the level.</p>
            <p>{waitForAnswer && mode === 'active'
              ? <>Wait for my answer is on, so the next character waits for you — but a right answer slower than ~{Math.round(1200 / effectiveWPM * 2.8 / 1000 * 10) / 10}s (your {effectiveWPM} WPM Farnsworth gap) still scores as a miss, exactly as it would timed.</>
              : <>At {effectiveWPM} WPM effective, you have ~{Math.round(1200 / effectiveWPM * 2.8 / 1000 * 10) / 10}s of thinking time per character.</>}</p>
          </div>

          {/* Start button */}
          <button onClick={countdown === null ? startWithCountdown : undefined}
            disabled={countdown !== null}
            className="w-full py-4 rounded-2xl bg-green-700 hover:bg-green-600 text-white
                       font-bold text-lg transition-all active:scale-95 disabled:cursor-not-allowed">
            {countdown !== null ? countdown
              : focusChars.length ? `${mode === 'active' ? '⌨' : '〜'} Drill ${focusChars.join(' · ')}`
              : mode === 'active' ? '⌨ Start Active Session'
              : '〜 Start Flow Session'}
          </button>
        </div>
      )}
    </div>
    </>
  )
}
