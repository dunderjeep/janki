'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type StrokeKind = 'R' | 'L' | 'FR' | 'FL' | 'DR' | 'DL' | 'BR' | 'BL'
type HitQuality = 'perfect' | 'good' | 'late' | 'miss'

interface Rudiment {
  name: string
  category: 'Rolls' | 'Paradiddles' | 'Flams' | 'Drags'
  description: string
  pattern: StrokeKind[]
  tempo: string
  tip: string
}

// A note queued for the Guitar Hero lane
interface LaneNote {
  id: number
  // Full stroke kind, not just R/L — patterns carry flams (FR/FL), drags
  // (DR/DL) and buzzes (BR/BL), and the render path compares against them.
  hand: StrokeKind
  beatTime: number   // AudioContext time when this note should be hit
  hit: boolean
  quality: HitQuality | null
}

// ── Audio synthesis ───────────────────────────────────────────────────────────

function playClick(ctx: AudioContext, time: number, type: 'accent' | 'beat' | 'sub') {
  const freq = type === 'accent' ? 1480 : type === 'beat' ? 880 : 660
  const gain = type === 'accent' ? 0.85 : type === 'beat' ? 0.5 : 0.18
  const osc  = ctx.createOscillator()
  const g    = ctx.createGain()
  osc.frequency.value = freq
  osc.type = 'sine'
  g.gain.setValueAtTime(0, time)
  g.gain.linearRampToValueAtTime(gain, time + 0.003)
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.04)
  osc.connect(g); g.connect(ctx.destination)
  osc.start(time); osc.stop(time + 0.06)
}

function playPadHit(ctx: AudioContext, time: number) {
  const len  = Math.floor(ctx.sampleRate * 0.12)
  const buf  = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const hpf = ctx.createBiquadFilter()
  hpf.type = 'highpass'
  hpf.frequency.value = 2000
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.35, time)
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.09)
  src.connect(hpf); hpf.connect(g); g.connect(ctx.destination)
  src.start(time); src.stop(time + 0.12)
}

// ── All 40 PAS Rudiments ──────────────────────────────────────────────────────

const RUDIMENTS: Rudiment[] = [
  { name: 'Single Stroke Roll',      category: 'Rolls',        description: 'Strict alternating strokes — the foundation of all drumming.',         pattern: ['R','L','R','L','R','L','R','L'],                                               tempo: '40–200+ BPM', tip: 'Keep strokes equal height. Stay relaxed — tension kills speed.' },
  { name: 'Single Stroke Four',      category: 'Rolls',        description: 'Four alternating strokes, accent on 1.',                                 pattern: ['R','L','R','L'],                                                               tempo: '60–200 BPM',  tip: 'Accent the first stroke clearly. Think in groups of four.' },
  { name: 'Single Stroke Seven',     category: 'Rolls',        description: 'Seven alternating strokes — starting hand switches each rep.',           pattern: ['R','L','R','L','R','L','R'],                                                   tempo: '60–180 BPM',  tip: "Embrace the hand-switch each cycle — it's the whole point." },
  { name: 'Multiple Bounce Roll',    category: 'Rolls',        description: 'Controlled buzz strokes alternating hands.',                             pattern: ['BR','BL','BR','BL'],                                                           tempo: '60–120 BPM',  tip: "Apply downward pressure to produce multiple bounces. Don't muscle it." },
  { name: 'Triple Stroke Roll',      category: 'Rolls',        description: 'Three consecutive strokes per hand.',                                    pattern: ['R','R','R','L','L','L'],                                                       tempo: '50–160 BPM',  tip: 'All three strokes per hand must be equal in volume and spacing.' },
  { name: 'Double Stroke Open Roll', category: 'Rolls',        description: "Two strokes per hand — let the second bounce naturally.",                pattern: ['R','R','L','L','R','R','L','L'],                                               tempo: '50–200 BPM',  tip: "The second stroke comes from the same wrist rebound — don't re-strike." },
  { name: 'Five Stroke Roll',        category: 'Rolls',        description: 'RRLLR — two doubles then an accented single.',                           pattern: ['R','R','L','L','R'],                                                           tempo: '60–160 BPM',  tip: 'Accent the final stroke. Starting hand alternates each repetition.' },
  { name: 'Six Stroke Roll',         category: 'Rolls',        description: 'RLLRRL — accents on strokes 1 and 4.',                                   pattern: ['R','L','L','R','R','L'],                                                       tempo: '60–160 BPM',  tip: 'Inner double strokes are open. Accents alternate each rep.' },
  { name: 'Seven Stroke Roll',       category: 'Rolls',        description: 'RRLLRRL — three doubles plus an accented single.',                       pattern: ['R','R','L','L','R','R','L'],                                                   tempo: '60–160 BPM',  tip: 'Accent the last stroke. Accenting hand alternates each repetition.' },
  { name: 'Nine Stroke Roll',        category: 'Rolls',        description: 'RRLLRRLLR — four doubles plus accent.',                                  pattern: ['R','R','L','L','R','R','L','L','R'],                                           tempo: '60–150 BPM',  tip: 'Common in rudimental and orchestral drumming. Clean doubles throughout.' },
  { name: 'Ten Stroke Roll',         category: 'Rolls',        description: 'RRLLRRLLRL — ends with two single strokes.',                             pattern: ['R','R','L','L','R','R','L','L','R','L'],                                       tempo: '60–150 BPM',  tip: 'Transition cleanly from doubles into the final single strokes.' },
  { name: 'Eleven Stroke Roll',      category: 'Rolls',        description: 'RRLLRRLLRRL.',                                                           pattern: ['R','R','L','L','R','R','L','L','R','R','L'],                                   tempo: '60–140 BPM',  tip: 'Accent the last stroke of each repetition.' },
  { name: 'Thirteen Stroke Roll',    category: 'Rolls',        description: 'RRLLRRLLRRLLR.',                                                         pattern: ['R','R','L','L','R','R','L','L','R','R','L','L','R'],                           tempo: '60–130 BPM',  tip: 'Keep inner doubles controlled and consistent throughout.' },
  { name: 'Fifteen Stroke Roll',     category: 'Rolls',        description: 'RRLLRRLLRRLLRRL.',                                                       pattern: ['R','R','L','L','R','R','L','L','R','R','L','L','R','R','L'],                   tempo: '60–130 BPM',  tip: 'Stamina rudiment. Maintain even doubles from start to accent.' },
  { name: 'Seventeen Stroke Roll',   category: 'Rolls',        description: 'RRLLRRLLRRLLRRLLR — the longest roll rudiment.',                         pattern: ['R','R','L','L','R','R','L','L','R','R','L','L','R','R','L','L','R'],           tempo: '60–120 BPM',  tip: "Focus on consistency across all 17 strokes. Don't rush the final accent." },
  { name: 'Single Paradiddle',       category: 'Paradiddles',  description: 'RLRR LRLL — the core paradiddle building block.',                        pattern: ['R','L','R','R','L','R','L','L'],                                               tempo: '60–160 BPM',  tip: 'Accent beat 1. The diddle falls on strokes 3–4 and 7–8.' },
  { name: 'Double Paradiddle',       category: 'Paradiddles',  description: 'RLRLRR LRLRLL — 6-note grouping.',                                       pattern: ['R','L','R','L','R','R','L','R','L','R','L','L'],                               tempo: '60–140 BPM',  tip: 'Works beautifully over triplets. Two singles before the diddle.' },
  { name: 'Triple Paradiddle',       category: 'Paradiddles',  description: 'RLRLRLRR LRLRLRLL — 8-note grouping.',                                   pattern: ['R','L','R','L','R','L','R','R','L','R','L','R','L','R','L','L'],               tempo: '60–120 BPM',  tip: 'Long pattern — stay relaxed. Three singles before the diddle.' },
  { name: 'Single Paradiddle-Diddle',category: 'Paradiddles',  description: 'RLRRLL LRLLRR — 6-note grouping with double diddle.',                    pattern: ['R','L','R','R','L','L','L','R','L','L','R','R'],                               tempo: '60–140 BPM',  tip: 'Two diddles at the end. Natural in 6/8 and 12/8 feels.' },
  { name: 'Flam',                    category: 'Flams',        description: 'Grace note immediately before the main stroke. Alternates.',              pattern: ['FR','FL'],                                                                     tempo: '60–160 BPM',  tip: 'Grace note is low and soft; main stroke is full height. Zero gap.' },
  { name: 'Flam Accent',             category: 'Flams',        description: 'lRLR rLRL — flam on the accented beat of a triplet.',                    pattern: ['FR','L','R','FL','R','L'],                                                     tempo: '60–140 BPM',  tip: 'Feel the triplet subdivision. Accent sits on the flam note.' },
  { name: 'Flam Tap',                category: 'Flams',        description: 'lRR rLL — flam then tap on the same hand.',                              pattern: ['FR','R','FL','L'],                                                             tempo: '60–160 BPM',  tip: 'The second stroke is a quiet tap, not a double stroke.' },
  { name: 'Flamacue',                category: 'Flams',        description: 'lRLR̂RL — flam on 1, accent on 4, 5-stroke groups.',                    pattern: ['FR','L','R','R','L','FL','R','L','L','R'],                                     tempo: '60–140 BPM',  tip: 'Accent falls on the 4th note of each 5-stroke group.' },
  { name: 'Flam Paradiddle',         category: 'Flams',        description: 'lRLRR rLRLL — paradiddle with a flam on the accent.',                    pattern: ['FR','L','R','R','FL','R','L','L'],                                             tempo: '60–140 BPM',  tip: 'Combine clean flam control with relaxed paradiddle sticking.' },
  { name: 'Single Flammed Mill',     category: 'Flams',        description: 'lRrLRL rLlRLR — alternating flams within the pattern.',                  pattern: ['FR','FL','R','L','FL','FR','L','R'],                                           tempo: '60–120 BPM',  tip: 'Note which hand carries each flam — it shifts mid-pattern.' },
  { name: 'Flam Paradiddle-Diddle',  category: 'Flams',        description: 'lRLRRLL — 7-note grouping with flam and double diddle.',                 pattern: ['FR','L','R','R','L','L','FL','R','L','L','R','R'],                             tempo: '60–130 BPM',  tip: 'Combines flam accent, paradiddle flow, and a clean double diddle.' },
  { name: 'Pataflafla',              category: 'Flams',        description: 'lRrLlRrL — four consecutive alternating flams.',                         pattern: ['FR','FL','FR','FL'],                                                           tempo: '60–140 BPM',  tip: 'Every stroke is a flam. Grace note alternates with the main.' },
  { name: 'Swiss Army Triplet',      category: 'Flams',        description: 'lRRL rLLR — flam into a double stroke, triplet feel.',                   pattern: ['FR','R','L','FL','L','R'],                                                     tempo: '60–140 BPM',  tip: 'The double follows the flam naturally. Feel the triplet grouping.' },
  { name: 'Inverted Flam Tap',       category: 'Flams',        description: 'rRlL lLrR — grace note on the SAME side as the lead stroke.',            pattern: ['FR','R','FL','L','FL','L','FR','R'],                                           tempo: '60–140 BPM',  tip: 'Unusual inversion — both notes same hand. Practice very slowly.' },
  { name: 'Flam Drag',               category: 'Flams',        description: 'lRrrL rLllR — flam followed by a drag.',                                 pattern: ['FR','DL','FL','DR'],                                                           tempo: '60–130 BPM',  tip: 'Grace note control on both flam and drag within the same rudiment.' },
  { name: 'Drag',                    category: 'Drags',        description: 'Two grace notes before the main stroke. Alternates hands.',               pattern: ['DR','DL'],                                                                     tempo: '60–160 BPM',  tip: 'Grace notes are very quick and low. Main stroke is full height.' },
  { name: 'Single Drag Tap',         category: 'Drags',        description: 'rrLR llRL — drag then a tap.',                                           pattern: ['DL','R','DR','L'],                                                             tempo: '60–150 BPM',  tip: 'Drag is on the beat; the tap follows cleanly after.' },
  { name: 'Double Drag Tap',         category: 'Drags',        description: 'rrLrrLR llRllRL — two consecutive drags before the tap.',                 pattern: ['DL','DL','R','DR','DR','L'],                                                   tempo: '60–140 BPM',  tip: 'Two drag setups chained before the resolution tap.' },
  { name: 'Lesson 25',               category: 'Drags',        description: 'rrLL rrLL — drag leading into a double stroke.',                         pattern: ['DL','L','DR','R'],                                                             tempo: '60–150 BPM',  tip: 'Drag leads into a double-stroke tap. Feel the two-note bounce.' },
  { name: 'Single Dragadiddle',      category: 'Drags',        description: 'RrrLRR LllRLL — paradiddle with an inner drag.',                         pattern: ['R','DL','R','R','L','DR','L','L'],                                             tempo: '60–140 BPM',  tip: 'Drag replaces the 2nd stroke of the paradiddle pattern.' },
  { name: 'Drag Paradiddle #1',      category: 'Drags',        description: 'RrrLRLL — 7-stroke group, drag on 2nd note.',                            pattern: ['R','DL','R','L','L','L','DR','L','R','R'],                                     tempo: '60–140 BPM',  tip: 'The drag shifts the paradiddle balance. Go slow first.' },
  { name: 'Drag Paradiddle #2',      category: 'Drags',        description: 'RrrLrrLRLL — two drags per group.',                                      pattern: ['R','DL','DL','R','L','L','L','DR','DR','L','R','R'],                           tempo: '60–130 BPM',  tip: 'Two consecutive drag setups before the paradiddle resolution.' },
  { name: 'Single Ratamacue',        category: 'Drags',        description: 'rrLRL — drag leading into a triplet.',                                   pattern: ['DL','R','L','DR','L','R'],                                                     tempo: '60–140 BPM',  tip: 'The drag sets up a triplet feel. Common in rudimental solos.' },
  { name: 'Double Ratamacue',        category: 'Drags',        description: 'rrLrrLRL — two drags then resolution.',                                  pattern: ['DL','DL','R','L','DR','DR','L','R'],                                           tempo: '60–130 BPM',  tip: 'Two ratamacue drag setups chained — stay relaxed.' },
  { name: 'Triple Ratamacue',        category: 'Drags',        description: 'rrLrrLrrLRL — three drag setups before resolution.',                     pattern: ['DL','DL','DL','R','L','DR','DR','DR','L','R'],                                 tempo: '60–120 BPM',  tip: 'Three drag leadups. The RL resolution at the end feels earned.' },
]

const CATEGORIES = ['All', 'Rolls', 'Paradiddles', 'Flams', 'Drags'] as const

const isRight = (s: StrokeKind) => ['R','FR','DR','BR'].includes(s)

// ── Constants ─────────────────────────────────────────────────────────────────

const ADAPT_EVAL_BARS  = 4
const ADAPT_GOOD_MS    = 25
const ADAPT_BAD_MS     = 55
const ADAPT_STEP_UP    = 2
const ADAPT_STEP_DOWN  = 3
const ADAPT_MAX_BPM    = 160
const ADAPT_MIN_BPM    = 30
const LOOKAHEAD_MS     = 25
const SCHEDULE_AHEAD   = 2.5   // must be > LANE_LOOKAHEAD so notes spawn at the top
const MIC_FFT_SIZE     = 256
const ONSET_DEBOUNCE   = 80
const LANE_LOOKAHEAD   = 2.0   // seconds of notes to show ahead in the lane

// ── Quality thresholds ────────────────────────────────────────────────────────
const Q_PERFECT = 20   // ms
const Q_GOOD    = 45
const Q_LATE    = 90

// ── Guitar Hero Lane ──────────────────────────────────────────────────────────

function GuitarHeroLane({
  notes,
  audioCtxRef,
  accuracy,
  goodMs,
  badMs,
}: {
  notes: LaneNote[]
  audioCtxRef: React.RefObject<AudioContext | null>
  accuracy: number | null
  goodMs: number
  badMs: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const notesRef  = useRef(notes)
  const accRef    = useRef(accuracy)
  const goodRef   = useRef(goodMs)
  const badRef    = useRef(badMs)
  useEffect(() => { notesRef.current = notes   }, [notes])
  useEffect(() => { accRef.current   = accuracy }, [accuracy])
  useEffect(() => { goodRef.current  = goodMs   }, [goodMs])
  useEffect(() => { badRef.current   = badMs    }, [badMs])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let raf: number
    const dpr = window.devicePixelRatio || 1

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvas.width  = Math.floor(r.width  * dpr)
      canvas.height = Math.floor(r.height * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx || canvas.width === 0) { raf = requestAnimationFrame(draw); return }

      const W = canvas.width  / dpr
      const H = canvas.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const now = audioCtxRef.current?.currentTime ?? 0

      // ── Background with accuracy glow ────────────────────────────────
      const acc   = accRef.current
      const good  = goodRef.current
      const bad   = badRef.current
      let bgGlow  = 'rgba(0,0,0,0)'
      if (acc !== null) {
        if (acc < good)       bgGlow = `rgba(16,185,129,${Math.max(0, 0.18 - (acc / good) * 0.15)})`  // emerald
        else if (acc >= bad)  bgGlow = `rgba(239,68,68,${Math.min(0.25, (acc - bad) / 60 * 0.25)})`   // red
      }
      ctx.fillStyle = '#030712'
      ctx.fillRect(0, 0, W, H)
      if (bgGlow !== 'rgba(0,0,0,0)') {
        const grad = ctx.createRadialGradient(W/2, H, 0, W/2, H, H * 1.2)
        grad.addColorStop(0, bgGlow)
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      }

      // ── Lane divider & labels ─────────────────────────────────────────
      const laneW = W / 2
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth   = 1
      ctx.beginPath(); ctx.moveTo(laneW, 0); ctx.lineTo(laneW, H); ctx.stroke()

      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(147,197,253,0.25)'
      ctx.fillText('R', laneW * 1.5, 18)
      ctx.fillStyle = 'rgba(216,180,254,0.25)'
      ctx.fillText('L', laneW * 0.5, 18)

      // ── Hit zone line ─────────────────────────────────────────────────
      const hitY = H - 48
      // Glow under hit line
      const hitGrad = ctx.createLinearGradient(0, hitY - 12, 0, hitY + 4)
      hitGrad.addColorStop(0, 'rgba(255,255,255,0)')
      hitGrad.addColorStop(1, 'rgba(255,255,255,0.07)')
      ctx.fillStyle = hitGrad
      ctx.fillRect(0, hitY - 12, W, 16)

      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth   = 2
      ctx.beginPath(); ctx.moveTo(0, hitY); ctx.lineTo(W, hitY); ctx.stroke()

      // Hit zone targets
      for (const [cx, color] of [[laneW * 0.5, 'rgba(216,180,254,0.35)'], [laneW * 1.5, 'rgba(147,197,253,0.35)']] as [number, string][]) {
        ctx.beginPath()
        ctx.arc(cx, hitY, 22, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.lineWidth   = 2
        ctx.stroke()
      }

      // ── Notes ─────────────────────────────────────────────────────────
      const notes = notesRef.current
      for (const note of notes) {
        const dt  = note.beatTime - now            // seconds until hit
        if (dt > LANE_LOOKAHEAD + 0.2) continue   // too far ahead
        if (dt < -0.5) continue                   // already long gone

        const cx = isRight(note.hand as StrokeKind) ? laneW * 1.5 : laneW * 0.5
        const y  = hitY - (dt / LANE_LOOKAHEAD) * (hitY - 30)

        // Colour based on hit quality
        let fill: string
        if (note.hit && note.quality) {
          fill = note.quality === 'perfect' ? 'rgba(52,211,153,0.9)'
               : note.quality === 'good'    ? 'rgba(251,191,36,0.9)'
               : note.quality === 'late'    ? 'rgba(251,113,133,0.85)'
               :                             'rgba(100,100,100,0.6)'
        } else {
          fill = isRight(note.hand as StrokeKind)
            ? 'rgba(96,165,250,0.90)'
            : 'rgba(192,132,252,0.90)'
        }

        // Glow
        const glow = ctx.createRadialGradient(cx, y, 0, cx, y, 30)
        glow.addColorStop(0, fill.replace('0.9', '0.25').replace('0.85', '0.2'))
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = glow
        ctx.fillRect(cx - 30, y - 30, 60, 60)

        // Circle
        ctx.beginPath()
        ctx.arc(cx, y, note.hit ? 14 : 18, 0, Math.PI * 2)
        ctx.fillStyle = fill
        ctx.fill()

        // Hand label inside note
        ctx.fillStyle = 'rgba(0,0,0,0.8)'
        ctx.font = 'bold 12px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(note.hand === 'R' || note.hand === 'FR' || note.hand === 'DR' || note.hand === 'BR' ? 'R' : 'L', cx, y + 4)

        // Quality flash label
        if (note.hit && note.quality && dt > -0.3) {
          const label = note.quality === 'perfect' ? 'PERFECT' : note.quality === 'good' ? 'GOOD' : note.quality === 'late' ? 'LATE' : ''
          if (label) {
            ctx.font      = 'bold 10px sans-serif'
            ctx.fillStyle = fill
            ctx.textAlign = 'center'
            ctx.fillText(label, cx, y - 24)
          }
        }
      }

      // ── Accuracy tint overlay at bottom ───────────────────────────────
      if (acc !== null) {
        let strip = ''
        if (acc < good)      strip = `rgba(16,185,129,0.12)`
        else if (acc >= bad) strip = `rgba(239,68,68,0.12)`
        if (strip) {
          ctx.fillStyle = strip
          ctx.fillRect(0, H - 6, W, 6)
        }
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [audioCtxRef])

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-gray-800" style={{ height: 320 }}>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  )
}

// ── Score display ─────────────────────────────────────────────────────────────

interface Score { perfect: number; good: number; late: number; miss: number; streak: number; best: number }

function ScoreBar({ score, accuracy, consistency }: { score: Score; accuracy: number | null; consistency: number | null }) {
  const total = score.perfect + score.good + score.late + score.miss
  const pct   = total > 0 ? Math.round(((score.perfect + score.good) / total) * 100) : null

  const zoneColor =
    accuracy === null      ? 'text-gray-500' :
    accuracy < ADAPT_GOOD_MS ? 'text-emerald-400' :
    accuracy < ADAPT_BAD_MS  ? 'text-amber-400'   :
                              'text-red-400'

  const zoneBg =
    accuracy === null        ? '' :
    accuracy < ADAPT_GOOD_MS ? 'shadow-[0_0_20px_rgba(16,185,129,0.2)]' :
    accuracy < ADAPT_BAD_MS  ? '' :
                               'shadow-[0_0_20px_rgba(239,68,68,0.25)]'

  return (
    <div className={`w-full bg-gray-900 rounded-2xl px-5 py-3 flex items-center gap-5 flex-wrap transition-all ${zoneBg}`}>
      {/* Hit breakdown */}
      <div className="flex gap-4">
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Perfect</span>
          <span className="text-xl font-bold text-emerald-400 tabular-nums">{score.perfect}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Good</span>
          <span className="text-xl font-bold text-amber-400 tabular-nums">{score.good}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Late</span>
          <span className="text-xl font-bold text-red-400 tabular-nums">{score.late}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Miss</span>
          <span className="text-xl font-bold text-gray-600 tabular-nums">{score.miss}</span>
        </div>
      </div>

      <div className="h-8 w-px bg-gray-800" />

      {/* Streak */}
      <div className="flex flex-col items-center">
        <span className="text-[10px] text-gray-500 uppercase tracking-widest">Streak</span>
        <span className={`text-xl font-bold tabular-nums ${score.streak >= 8 ? 'text-orange-400' : 'text-white'}`}>
          {score.streak} <span className="text-xs text-gray-600 font-normal">/ best {score.best}</span>
        </span>
      </div>

      <div className="h-8 w-px bg-gray-800" />

      {/* % */}
      {pct !== null && (
        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Accuracy</span>
          <span className={`text-xl font-bold tabular-nums ${pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-red-400'}`}>
            {pct}%
          </span>
        </div>
      )}

      <div className="ml-auto flex flex-col items-end gap-0.5">
        {accuracy !== null && (
          <span className={`text-sm font-mono font-bold ${zoneColor}`}>{accuracy}ms avg</span>
        )}
        {consistency !== null && (
          <span className="text-xs font-mono text-gray-500">±{consistency}ms</span>
        )}
      </div>
    </div>
  )
}

// ── Bar history strip ─────────────────────────────────────────────────────────

function BarStrip({ history, goodMs, badMs }: { history: number[]; goodMs: number; badMs: number }) {
  if (history.length === 0) return null
  return (
    <div className="flex gap-1 items-end h-8">
      {history.slice(-16).map((avg, i) => {
        const color = avg < goodMs ? 'bg-emerald-500' : avg < badMs ? 'bg-amber-500' : 'bg-red-500'
        const h     = Math.max(4, Math.min(32, Math.round(32 - avg * 0.4)))
        return <div key={i} className={`w-3 rounded-t ${color} transition-all`} style={{ height: h }} title={`${Math.round(avg)}ms`} />
      })}
    </div>
  )
}

// ── StrokeCell ────────────────────────────────────────────────────────────────

function StrokeCell({ stroke, active }: { stroke: StrokeKind; active: boolean }) {
  const mainHand  = isRight(stroke) ? 'R' : 'L'
  const graceHand = mainHand === 'R' ? 'l' : 'r'
  const hasFlam   = stroke.startsWith('F')
  const hasDrag   = stroke.startsWith('D')
  const hasBuzz   = stroke.startsWith('B')
  const bg = active
    ? mainHand === 'R'
      ? 'bg-blue-500 border-blue-400 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]'
      : 'bg-purple-500 border-purple-400 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
    : mainHand === 'R'
      ? 'bg-blue-950 border-blue-800 text-blue-300'
      : 'bg-purple-950 border-purple-800 text-purple-300'
  return (
    <div className={`relative w-10 h-10 rounded-lg flex items-center justify-center border-2 transition-all duration-75 select-none ${bg} ${active ? 'scale-110' : ''}`}>
      {hasFlam && <span className="absolute top-0.5 left-1 text-[8px] opacity-60 font-mono">{graceHand}</span>}
      {hasDrag && <span className="absolute top-0.5 left-0.5 text-[8px] opacity-60 font-mono">{graceHand}{graceHand}</span>}
      <span className="text-sm font-bold font-mono">{mainHand}</span>
      {hasBuzz && <span className="absolute bottom-0.5 right-0.5 text-[8px] opacity-60">~</span>}
    </div>
  )
}

// ── DrumTrainer ───────────────────────────────────────────────────────────────

export function DrumTrainer() {

  // ── Metronome ─────────────────────────────────────────────────────────────
  const [bpm,          setBpm]          = useState(80)
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [timeSig,      setTimeSig]      = useState(4)
  const [subdivision,  setSubdivision]  = useState(1)
  const [beatPos,      setBeatPos]      = useState(-1)
  const [pulseType,    setPulseType]    = useState<'accent' | 'beat' | 'sub' | null>(null)

  // ── Adaptive BPM ─────────────────────────────────────────────────────────
  type AdaptMode = 'off' | 'up-only' | 'adaptive'
  const [adaptMode,    setAdaptMode]    = useState<AdaptMode>('off')
  const [adaptStatus,  setAdaptStatus]  = useState<'up' | 'down' | 'hold' | null>(null)
  const [barHistory,   setBarHistory]   = useState<number[]>([])
  const [goodMs,       setGoodMs]       = useState(ADAPT_GOOD_MS)
  const [badMs,        setBadMs]        = useState(ADAPT_BAD_MS)
  const [maxBpm,       setMaxBpm]       = useState(ADAPT_MAX_BPM)

  // ── Rudiment ──────────────────────────────────────────────────────────────
  const [category,     setCategory]     = useState<typeof CATEGORIES[number]>('All')
  const [rudimentIdx,  setRudimentIdx]  = useState(15)
  const [patternPos,   setPatternPos]   = useState(0)

  // ── Pad / mic ─────────────────────────────────────────────────────────────
  const [hitFlash,     setHitFlash]     = useState(false)
  const [lastLabel,    setLastLabel]    = useState<string | null>(null)
  const [micActive,    setMicActive]    = useState(false)
  const [micError,     setMicError]     = useState('')
  const [micSens,      setMicSens]      = useState(2.5)
  const [micLevel,     setMicLevel]     = useState(0)

  // ── Score ─────────────────────────────────────────────────────────────────
  const [score,        setScore]        = useState<Score>({ perfect: 0, good: 0, late: 0, miss: 0, streak: 0, best: 0 })

  // ── Accuracy stats ────────────────────────────────────────────────────────
  const [accuracy,     setAccuracy]     = useState<number | null>(null)
  const [consistency,  setConsistency]  = useState<number | null>(null)

  // ── Lane notes (Guitar Hero) ──────────────────────────────────────────────
  const [laneNotes,    setLaneNotes]    = useState<LaneNote[]>([])

  // ── Tap ───────────────────────────────────────────────────────────────────
  const [tapTimes,     setTapTimes]     = useState<number[]>([])

  // ── Refs ──────────────────────────────────────────────────────────────────
  const ctxRef          = useRef<AudioContext | null>(null)
  const schedRef        = useRef<number | null>(null)
  const nextTimeRef     = useRef(0.0)
  const globalSubRef    = useRef(0)
  const barCountRef     = useRef(0)
  const noteIdRef       = useRef(0)

  const bpmRef          = useRef(bpm)
  const timeSigRef      = useRef(timeSig)
  const subRef          = useRef(subdivision)
  const adaptModeRef    = useRef<AdaptMode>('off')
  const goodMsRef       = useRef(goodMs)
  const badMsRef        = useRef(badMs)
  const maxBpmRef       = useRef(maxBpm)
  const rudimentIdxRef  = useRef(rudimentIdx)
  const patternPosRef   = useRef(0)  // ref for scheduler to read current pattern pos

  useEffect(() => { bpmRef.current         = bpm         }, [bpm])
  useEffect(() => { timeSigRef.current     = timeSig     }, [timeSig])
  useEffect(() => { subRef.current         = subdivision }, [subdivision])
  useEffect(() => { adaptModeRef.current   = adaptMode   }, [adaptMode])
  useEffect(() => { goodMsRef.current      = goodMs      }, [goodMs])
  useEffect(() => { badMsRef.current       = badMs       }, [badMs])
  useEffect(() => { maxBpmRef.current      = maxBpm      }, [maxBpm])
  useEffect(() => { rudimentIdxRef.current = rudimentIdx }, [rudimentIdx])

  const scheduledRef    = useRef<{ time: number }[]>([])
  const hitTimesRef     = useRef<number[]>([])
  const hitDevsRef      = useRef<number[]>([])
  const barHitsRef      = useRef<number[]>([])
  const barHistoryRef   = useRef<number[]>([])

  // Lane notes ref (so scheduler can append without stale closures)
  const laneNotesRef    = useRef<LaneNote[]>([])

  // Mic
  const micStreamRef    = useRef<MediaStream | null>(null)
  const micAnalyserRef  = useRef<AnalyserNode | null>(null)
  const micRafRef       = useRef<number | null>(null)
  const micSensRef      = useRef(micSens)
  const lastOnsetRef    = useRef(0)
  const bgEnergyRef     = useRef(0)

  useEffect(() => { micSensRef.current = micSens }, [micSens])

  // ── Scheduler ──────────────────────────────────────────────────────────────

  const schedule = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return

    const totalSubs = timeSigRef.current * subRef.current
    const subDur    = 60 / (bpmRef.current * subRef.current)

    while (nextTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD) {
      const si       = globalSubRef.current % totalSubs
      const isAccent = si === 0
      const isBeat   = si % subRef.current === 0
      const type     = isAccent ? 'accent' : isBeat ? 'beat' : 'sub'

      playClick(ctx, nextTimeRef.current, type)
      scheduledRef.current.push({ time: nextTimeRef.current })
      if (scheduledRef.current.length > 128) scheduledRef.current.shift()

      // Enqueue lane note for the current pattern position
      const pattern = RUDIMENTS[rudimentIdxRef.current].pattern
      const pp      = patternPosRef.current
      const stroke  = pattern[pp]
      const noteId  = noteIdRef.current++
      const note: LaneNote = { id: noteId, hand: stroke, beatTime: nextTimeRef.current, hit: false, quality: null }
      laneNotesRef.current = [...laneNotesRef.current, note].slice(-80)
      setLaneNotes([...laneNotesRef.current])
      patternPosRef.current = (pp + 1) % pattern.length

      const delay        = Math.max(0, (nextTimeRef.current - ctx.currentTime) * 1000)
      const capturedSi   = si
      const capturedType = type

      setTimeout(() => {
        setBeatPos(capturedSi)
        setPulseType(capturedType)
        setTimeout(() => setPulseType(null), 90)
      }, delay)

      // ── Bar-boundary logic ──────────────────────────────────────────────
      if (isAccent) {
        barCountRef.current++
        const barHits = barHitsRef.current.splice(0)
        if (barHits.length > 0) {
          const barAvg     = barHits.reduce((a, b) => a + Math.abs(b), 0) / barHits.length
          const newHistory = [...barHistoryRef.current, barAvg].slice(-32)
          barHistoryRef.current = newHistory
          setBarHistory([...newHistory])
        }

        const mode    = adaptModeRef.current
        const history = barHistoryRef.current
        if (mode !== 'off' && history.length >= ADAPT_EVAL_BARS) {
          const recent = history.slice(-ADAPT_EVAL_BARS)
          const avgDev = recent.reduce((a, b) => a + b, 0) / recent.length
          if (mode === 'adaptive' && avgDev > badMsRef.current) {
            const next = Math.max(ADAPT_MIN_BPM, bpmRef.current - ADAPT_STEP_DOWN)
            bpmRef.current = next; setBpm(next); setAdaptStatus('down')
          } else if (avgDev < goodMsRef.current) {
            const next = Math.min(maxBpmRef.current, bpmRef.current + ADAPT_STEP_UP)
            bpmRef.current = next; setBpm(next); setAdaptStatus('up')
          } else {
            setAdaptStatus('hold')
          }
        }
      }

      globalSubRef.current++
      nextTimeRef.current += subDur
    }
  }, [])

  // ── Play / Stop ────────────────────────────────────────────────────────────

  const start = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    const ctx = ctxRef.current
    if (ctx.state === 'suspended') ctx.resume()
    nextTimeRef.current   = ctx.currentTime + 0.05
    globalSubRef.current  = 0
    barCountRef.current   = 0
    scheduledRef.current  = []
    barHitsRef.current    = []
    laneNotesRef.current  = []
    patternPosRef.current = 0
    setLaneNotes([])
    schedule()
    schedRef.current = window.setInterval(schedule, LOOKAHEAD_MS)
    setIsPlaying(true)
    setAdaptStatus(null)
  }, [schedule])

  const stop = useCallback(() => {
    if (schedRef.current) clearInterval(schedRef.current)
    setIsPlaying(false)
    setBeatPos(-1)
  }, [])

  useEffect(() => () => { if (schedRef.current) clearInterval(schedRef.current) }, [])

  // ── Register hit ───────────────────────────────────────────────────────────

  const registerHit = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    const ctx = ctxRef.current
    if (ctx.state === 'suspended') ctx.resume()

    playPadHit(ctx, ctx.currentTime)
    setHitFlash(true)
    setTimeout(() => setHitFlash(false), 100)

    if (isPlaying && scheduledRef.current.length > 0) {
      const now     = ctx.currentTime
      const nearest = scheduledRef.current.reduce((best, s) =>
        Math.abs(s.time - now) < Math.abs(best.time - now) ? s : best
      )
      const devMs = Math.round((now - nearest.time) * 1000)

      hitDevsRef.current = [...hitDevsRef.current, devMs].slice(-64)
      barHitsRef.current = [...barHitsRef.current, devMs]

      const avgDev = hitDevsRef.current.reduce((a, b) => a + Math.abs(b), 0) / hitDevsRef.current.length
      setAccuracy(Math.round(avgDev))

      // Quality
      const absMs   = Math.abs(devMs)
      const quality: HitQuality =
        absMs < Q_PERFECT ? 'perfect' :
        absMs < Q_GOOD    ? 'good'    :
        absMs < Q_LATE    ? 'late'    : 'miss'

      const label = quality === 'perfect' ? 'Perfect' : quality === 'good' ? 'Good' : quality === 'late' ? (devMs > 0 ? 'Late' : 'Early') : 'Miss'
      setLastLabel(label)
      setTimeout(() => setLastLabel(null), 600)

      // Score
      setScore(prev => {
        const streak = quality === 'miss' ? 0 : prev.streak + 1
        return {
          ...prev,
          [quality]: prev[quality] + 1,
          streak,
          best: Math.max(prev.best, streak),
        }
      })

      // Mark the nearest unresolved lane note as hit
      const nearestNote = laneNotesRef.current
        .filter(n => !n.hit && Math.abs(n.beatTime - now) < 0.15)
        .sort((a, b) => Math.abs(a.beatTime - now) - Math.abs(b.beatTime - now))[0]

      if (nearestNote) {
        laneNotesRef.current = laneNotesRef.current.map(n =>
          n.id === nearestNote.id ? { ...n, hit: true, quality } : n
        )
        setLaneNotes([...laneNotesRef.current])
      }
    }

    // Advance pattern display
    setPatternPos(p => (p + 1) % RUDIMENTS[rudimentIdx].pattern.length)

    // Consistency
    const nowPerf = performance.now()
    const prev    = hitTimesRef.current
    if (prev.length > 0) {
      const gap = nowPerf - prev[prev.length - 1]
      if (gap < 3000) {
        const intervals = [...prev.slice(1).map((t, i) => prev[i + 1] - prev[i]), gap].slice(-16)
        if (intervals.length >= 4) {
          const mean     = intervals.reduce((a, b) => a + b, 0) / intervals.length
          const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length
          setConsistency(Math.round(Math.sqrt(variance)))
        }
      }
    }
    hitTimesRef.current = [...prev, nowPerf].slice(-32)
  }, [isPlaying, rudimentIdx])

  // ── Tap tempo ──────────────────────────────────────────────────────────────

  const handleTap = useCallback(() => {
    const now = performance.now()
    setTapTimes(prev => {
      const recent = [...prev, now].filter(t => now - t < 3000).slice(-8)
      if (recent.length >= 2) {
        const intervals = recent.slice(1).map((t, i) => t - recent[i])
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
        const v = Math.max(30, Math.min(300, Math.round(60000 / avg)))
        setBpm(v); bpmRef.current = v
      }
      return recent
    })
  }, [])

  // ── Keyboard ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'KeyF') { e.preventDefault(); registerHit() }
      if (e.code === 'KeyT') { e.preventDefault(); handleTap() }
      if (e.code === 'KeyP') { e.preventDefault(); isPlaying ? stop() : start() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [registerHit, handleTap, isPlaying, start, stop])

  // ── Mic ────────────────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    setMicError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      if (!ctxRef.current) ctxRef.current = new AudioContext()
      const ctx = ctxRef.current
      if (ctx.state === 'suspended') ctx.resume()
      const source   = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = MIC_FFT_SIZE
      analyser.smoothingTimeConstant = 0
      source.connect(analyser)
      micStreamRef.current   = stream
      micAnalyserRef.current = analyser
      bgEnergyRef.current    = 0
      const buf = new Float32Array(MIC_FFT_SIZE)
      const loop = () => {
        analyser.getFloatTimeDomainData(buf)
        let ss = 0
        for (const v of buf) ss += v * v
        const rms = Math.sqrt(ss / buf.length)
        bgEnergyRef.current = bgEnergyRef.current * 0.95 + rms * 0.05
        setMicLevel(Math.min(1, rms / 0.3))
        const now = performance.now()
        if (rms > bgEnergyRef.current * micSensRef.current && rms > 0.01 && now - lastOnsetRef.current > ONSET_DEBOUNCE) {
          lastOnsetRef.current = now
          registerHit()
        }
        micRafRef.current = requestAnimationFrame(loop)
      }
      micRafRef.current = requestAnimationFrame(loop)
      setMicActive(true)
    } catch (err) {
      setMicError(err instanceof Error ? err.message : 'Microphone access denied')
    }
  }, [registerHit])

  const stopMic = useCallback(() => {
    if (micRafRef.current) cancelAnimationFrame(micRafRef.current)
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null; micAnalyserRef.current = null
    setMicActive(false); setMicLevel(0)
  }, [])

  useEffect(() => () => stopMic(), [stopMic])

  // ── Reset ──────────────────────────────────────────────────────────────────

  const resetAll = useCallback(() => {
    hitDevsRef.current    = []; hitTimesRef.current   = []
    barHitsRef.current    = []; barHistoryRef.current = []
    laneNotesRef.current  = []; patternPosRef.current = 0
    setAccuracy(null); setConsistency(null)
    setBarHistory([]); setAdaptStatus(null)
    setScore({ perfect: 0, good: 0, late: 0, miss: 0, streak: 0, best: 0 })
    setLaneNotes([]); setPatternPos(0)
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────

  const rudiment   = RUDIMENTS[rudimentIdx]
  const totalSubs  = timeSig * subdivision
  const nextStroke = rudiment.pattern[patternPos]
  const filteredRudiments = category === 'All' ? RUDIMENTS : RUDIMENTS.filter(r => r.category === category)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-6 flex flex-col gap-5 max-w-5xl mx-auto">

      {/* ── Score bar ─────────────────────────────────────────────────────── */}
      <ScoreBar score={score} accuracy={accuracy} consistency={consistency} />

      {/* ── Guitar Hero Lane ──────────────────────────────────────────────── */}
      <GuitarHeroLane
        notes={laneNotes}
        audioCtxRef={ctxRef}
        accuracy={accuracy}
        goodMs={goodMs}
        badMs={badMs}
      />

      {/* Hit quality flash over lane */}
      {lastLabel && (
        <div className={`-mt-4 text-center text-sm font-bold pointer-events-none ${
          lastLabel === 'Perfect' ? 'text-emerald-400' :
          lastLabel === 'Good'    ? 'text-amber-400'   :
          lastLabel === 'Miss'    ? 'text-gray-500'    : 'text-red-400'
        }`}>{lastLabel}</div>
      )}

      {/* ── Soundbrenner metronome ─────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-4">

        <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
          <div className={`absolute inset-0 rounded-full border-4 transition-all duration-75 ${pulseType === 'accent' ? 'border-orange-400 shadow-[0_0_40px_rgba(251,146,60,0.8)]' : 'border-gray-800'}`} />
          <div className={`absolute inset-3 rounded-full border-2 transition-all duration-75 ${pulseType === 'beat' ? 'border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'border-gray-800'}`} />
          <div className={`absolute inset-6 rounded-full transition-all duration-75 ${pulseType === 'sub' ? 'bg-gray-700' : 'bg-gray-900'}`} />
          {adaptStatus && adaptStatus !== 'hold' && (
            <div className={`absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-base font-bold ${adaptStatus === 'up' ? 'bg-emerald-500' : 'bg-red-500'}`}>
              {adaptStatus === 'up' ? '↑' : '↓'}
            </div>
          )}
          <div className="relative z-10 flex flex-col items-center gap-0.5">
            <span className={`text-5xl font-bold tabular-nums transition-colors ${isPlaying ? 'text-white' : 'text-gray-400'}`}>{bpm}</span>
            <span className="text-gray-500 text-sm">BPM</span>
          </div>
        </div>

        {/* BPM controls */}
        <div className="flex items-center gap-2">
          <button onClick={() => { const v = Math.max(30, bpm - 5); setBpm(v); bpmRef.current = v }} className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 font-bold text-lg">−</button>
          <button onClick={() => { const v = Math.max(30, bpm - 1); setBpm(v); bpmRef.current = v }} className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 text-xs font-mono">−1</button>
          <input type="range" min={30} max={300} value={bpm} onChange={e => { const v = Number(e.target.value); setBpm(v); bpmRef.current = v }} className="w-36 accent-orange-400" />
          <button onClick={() => { const v = Math.min(300, bpm + 1); setBpm(v); bpmRef.current = v }} className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 text-xs font-mono">+1</button>
          <button onClick={() => { const v = Math.min(300, bpm + 5); setBpm(v); bpmRef.current = v }} className="w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 font-bold text-lg">+</button>
        </div>

        {/* Time sig + subdivision */}
        <div className="flex gap-6 flex-wrap justify-center">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Beats / Bar</span>
            <div className="flex gap-1">
              {[2,3,4,5,6,7].map(n => (
                <button key={n} onClick={() => setTimeSig(n)}
                  className={`w-8 h-8 rounded text-sm font-mono transition-colors ${timeSig === n ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>{n}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest">Subdivision</span>
            <div className="flex gap-1">
              {[{ label: '♩', val: 1 }, { label: '♪', val: 2 }, { label: '♬', val: 4 }].map(({ label, val }) => (
                <button key={val} onClick={() => setSubdivision(val)}
                  className={`w-10 h-8 rounded text-base transition-colors ${subdivision === val ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Beat grid */}
        <div className="flex gap-1.5 flex-wrap justify-center">
          {Array.from({ length: totalSubs }).map((_, i) => {
            const isDownbeat = i % subdivision === 0
            const isBar1     = i === 0
            const isActive   = beatPos === i
            return (
              <div key={i} className={`rounded transition-all duration-75 ${isBar1 ? 'w-4 h-6' : isDownbeat ? 'w-3 h-5' : 'w-2 h-3'} ${isActive ? (isBar1 ? 'bg-orange-400' : isDownbeat ? 'bg-white' : 'bg-gray-400') : (isBar1 ? 'bg-orange-900' : isDownbeat ? 'bg-gray-700' : 'bg-gray-800')}`} />
            )
          })}
        </div>

        {/* Play / Stop + Tap */}
        <div className="flex items-center gap-4">
          <button onClick={handleTap} className="px-5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors">
            Tap <span className="text-gray-500 text-xs">[T]</span>
          </button>
          <button onClick={isPlaying ? stop : start}
            className={`px-8 py-3 rounded-2xl font-bold text-lg transition-colors ${isPlaying ? 'bg-red-600 hover:bg-red-500' : 'bg-orange-500 hover:bg-orange-400'}`}>
            {isPlaying ? 'Stop' : 'Play'} <span className="font-normal text-sm opacity-70">[P]</span>
          </button>
          <button onClick={resetAll} className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm text-gray-400 transition-colors">Reset</button>
        </div>

        {/* Adaptive BPM */}
        <div className="w-full max-w-md bg-gray-900 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-200">Adaptive BPM</span>
            <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
              {([['off','Off'],['up-only','Up only'],['adaptive','Smart']] as [AdaptMode, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setAdaptMode(val)}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${adaptMode === val ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}>{label}</button>
              ))}
            </div>
          </div>
          {adaptMode !== 'off' && (
            <div className="flex gap-4 flex-wrap text-xs text-gray-400">
              <label className="flex items-center gap-2">
                <span className="text-emerald-400">Good</span> ≤
                <input type="number" min={5} max={100} value={goodMs} onChange={e => setGoodMs(Number(e.target.value))} className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-center text-white" />ms
              </label>
              {adaptMode === 'adaptive' && (
                <label className="flex items-center gap-2">
                  <span className="text-red-400">Bad</span> ≥
                  <input type="number" min={10} max={200} value={badMs} onChange={e => setBadMs(Number(e.target.value))} className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-center text-white" />ms
                </label>
              )}
              <label className="flex items-center gap-2">
                Max
                <input type="number" min={40} max={300} value={maxBpm} onChange={e => setMaxBpm(Number(e.target.value))} className="w-14 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-center text-white" />BPM
              </label>
            </div>
          )}
          {adaptMode !== 'off' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] text-gray-600 uppercase tracking-wider">Last {Math.min(barHistory.length, 16)} bars</span>
              <BarStrip history={barHistory} goodMs={goodMs} badMs={badMs} />
              <div className="flex gap-4 text-[10px] text-gray-600">
                <span><span className="text-emerald-400">■</span> &lt;{goodMs}ms</span>
                <span><span className="text-amber-400">■</span> {goodMs}–{badMs}ms</span>
                <span><span className="text-red-400">■</span> &gt;{badMs}ms</span>
                {adaptStatus && <span className={`ml-auto font-semibold ${adaptStatus === 'up' ? 'text-emerald-400' : adaptStatus === 'down' ? 'text-red-400' : 'text-gray-500'}`}>
                  {adaptStatus === 'up' ? '↑ Speeding up' : adaptStatus === 'down' ? '↓ Slowing down' : '— Holding'}
                </span>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-800" />

      {/* ── Practice Pad ────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-5">
        <h2 className="text-lg font-semibold text-gray-200 tracking-wide">Practice Pad</h2>

        {/* Mic */}
        <div className="w-full max-w-md bg-gray-900 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${micActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
              <span className="text-sm font-medium text-gray-200">Mic Listener</span>
            </div>
            <button onClick={micActive ? stopMic : startMic}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${micActive ? 'bg-red-700 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}>
              {micActive ? 'Stop' : 'Enable'}
            </button>
          </div>
          {micError && <p className="text-red-400 text-xs">{micError}</p>}
          {micActive && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600 w-10">Level</span>
                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-75 ${micLevel > 0.7 ? 'bg-red-500' : micLevel > 0.3 ? 'bg-emerald-400' : 'bg-gray-600'}`} style={{ width: `${micLevel * 100}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600 w-10">Sens</span>
                <input type="range" min={1.2} max={6} step={0.1} value={micSens} onChange={e => setMicSens(Number(e.target.value))} className="flex-1 accent-orange-400" />
                <span className="text-[10px] text-gray-500 w-8 text-right font-mono">{micSens.toFixed(1)}×</span>
              </div>
              <p className="text-[10px] text-gray-600 leading-relaxed">Raise sensitivity if the metronome click triggers false hits.</p>
            </div>
          )}
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 bg-gray-900 p-1 rounded-xl">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${category === c ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}>{c}</button>
          ))}
        </div>

        {/* Rudiment picker */}
        <div className="flex flex-wrap justify-center gap-1.5 max-w-2xl">
          {filteredRudiments.map(r => {
            const gi = RUDIMENTS.indexOf(r)
            return (
              <button key={r.name}
                onClick={() => { setRudimentIdx(gi); setPatternPos(0); rudimentIdxRef.current = gi; resetAll() }}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${rudimentIdx === gi ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                {r.name}
              </button>
            )
          })}
        </div>

        {/* Rudiment info */}
        <div className="text-center max-w-sm">
          <p className="text-gray-200 font-medium">{rudiment.name}</p>
          <p className="text-gray-400 text-sm mt-0.5">{rudiment.description}</p>
          <p className="text-orange-400 text-xs mt-1 italic">{rudiment.tip}</p>
          <p className="text-gray-600 text-xs mt-0.5">Suggested: {rudiment.tempo}</p>
        </div>

        {/* Pattern */}
        <div className="flex flex-wrap justify-center gap-1.5 max-w-2xl px-2">
          {rudiment.pattern.map((stroke, i) => (
            <StrokeCell key={i} stroke={stroke} active={i === patternPos} />
          ))}
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-xs text-gray-600">
          <span><span className="text-blue-400">■</span> Right (R lane)</span>
          <span><span className="text-purple-400">■</span> Left (L lane)</span>
          <span><code className="text-gray-500">l/r</code> = grace</span>
          <span><code className="text-gray-500">~</code> = buzz</span>
        </div>

        {/* Pad button */}
        <div className="flex flex-col items-center gap-2">
          <button
            onPointerDown={e => { e.preventDefault(); registerHit() }}
            className={`w-32 h-32 rounded-full border-4 font-bold text-xl transition-all duration-75 select-none ${
              hitFlash
                ? 'bg-blue-500 border-blue-400 scale-95 shadow-[0_0_30px_rgba(59,130,246,0.6)]'
                : 'bg-gray-800 border-gray-600 hover:bg-gray-700 active:scale-95'
            }`}
          >Hit</button>
          <span className="text-xs text-gray-600">F · J · Space</span>
        </div>

        <p className="text-[11px] text-gray-700 text-center max-w-sm leading-relaxed">
          Hit the pad (or enable Mic) to play along. Notes fall in the lane above — hit them as they cross the line.
        </p>
      </div>
    </div>
  )
}
