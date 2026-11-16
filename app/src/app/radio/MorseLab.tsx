'use client'

import { useState, useCallback, useRef } from 'react'
import { MORSE, PHONETICS } from '@/data/radio-bands'

// ── Morse encoder ─────────────────────────────────────────────────────────────

function textToMorse(text: string): string {
  return text.toUpperCase().split('').map(ch => MORSE[ch] ?? '').join('  ')
}

function morseToTokens(morse: string): { symbol: string; type: 'dit' | 'dah' | 'space' | 'wordspace' }[] {
  const tokens: { symbol: string; type: 'dit' | 'dah' | 'space' | 'wordspace' }[] = []
  for (const ch of morse) {
    if (ch === '.') tokens.push({ symbol: '·', type: 'dit' })
    else if (ch === '-') tokens.push({ symbol: '—', type: 'dah' })
    else if (ch === ' ') {
      // Double space = word space
      const last = tokens[tokens.length - 1]
      if (last?.type === 'space') {
        tokens[tokens.length - 1] = { symbol: ' / ', type: 'wordspace' }
      } else {
        tokens.push({ symbol: ' ', type: 'space' })
      }
    }
  }
  return tokens
}

// ── Web Audio CW tone generator ───────────────────────────────────────────────

function useMorseAudio() {
  const ctxRef = useRef<AudioContext | null>(null)

  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    return ctxRef.current
  }, [])

  const playMorse = useCallback(async (text: string, wpm: number, freq: number) => {
    const ctx     = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()

    const dotMs   = 1200 / wpm          // milliseconds per dit
    const dot     = dotMs / 1000
    const dah     = dot * 3
    const symGap  = dot                 // gap between symbols
    const charGap = dot * 3
    const wordGap = dot * 7

    const morse = textToMorse(text)
    let t = ctx.currentTime + 0.05

    const tone = (start: number, dur: number) => {
      const osc   = ctx.createOscillator()
      const gain  = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      // Soft envelope to avoid clicks
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.4, start + 0.005)
      gain.gain.setValueAtTime(0.4, start + dur - 0.005)
      gain.gain.linearRampToValueAtTime(0, start + dur)
      osc.start(start)
      osc.stop(start + dur + 0.01)
    }

    const words = text.toUpperCase().split(' ')
    for (let wi = 0; wi < words.length; wi++) {
      const chars = words[wi].split('')
      for (let ci = 0; ci < chars.length; ci++) {
        const code = MORSE[chars[ci]]
        if (!code) continue
        const syms = code.split('')
        for (let si = 0; si < syms.length; si++) {
          const dur = syms[si] === '.' ? dot : dah
          tone(t, dur)
          t += dur
          if (si < syms.length - 1) t += symGap
        }
        if (ci < chars.length - 1) t += charGap
      }
      if (wi < words.length - 1) t += wordGap
    }
  }, [getCtx])

  return { playMorse }
}

// ── Visual key display ────────────────────────────────────────────────────────

function MorseDisplay({ morse }: { morse: string }) {
  const tokens = morseToTokens(morse)
  return (
    <div className="flex flex-wrap gap-0.5 font-mono text-lg leading-relaxed min-h-12 p-3
                    bg-gray-950 rounded-xl border border-gray-800">
      {tokens.length === 0 && (
        <span className="text-gray-600 text-sm">Type something above…</span>
      )}
      {tokens.map((tok, i) => (
        <span key={i}
          className={
            tok.type === 'dit'       ? 'text-green-400 font-bold' :
            tok.type === 'dah'       ? 'text-blue-400 font-bold text-xl' :
            tok.type === 'wordspace' ? 'text-gray-600 text-xs px-1' :
            'text-transparent'
          }>
          {tok.symbol}
        </span>
      ))}
    </div>
  )
}

// ── Character-by-character breakdown ─────────────────────────────────────────

function MorseTable({ text }: { text: string }) {
  const chars = text.toUpperCase().split('').filter(c => c in MORSE)
  if (chars.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {chars.map((ch, i) => (
        <div key={i} className="bg-gray-900 rounded-lg px-2 py-1 text-center min-w-[44px]">
          <div className="text-xs font-bold text-white">{ch}</div>
          <div className="text-[11px] font-mono text-green-400 mt-0.5">{MORSE[ch]}</div>
          {PHONETICS[ch] && (
            <div className="text-[9px] text-gray-500 mt-0.5">{PHONETICS[ch]}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Keyer animation (simulated key-down visual) ────────────────────────────────

function KeyerDisplay({ morse }: { morse: string }) {
  // Build a flat timing diagram: 1=key down, 0=key up
  const DOT = 1
  const DAH = 3
  const GAP = 1   // between symbols
  const CGAP = 3  // between characters
  const WGAP = 7  // between words

  const bits: number[] = []
  const words = morse.split('   ')  // triple space = word gap
  words.forEach((word, wi) => {
    const chars = word.split('  ')  // double space = char gap
    chars.forEach((code, ci) => {
      const syms = code.split('')
      syms.forEach((s, si) => {
        const len = s === '.' ? DOT : s === '-' ? DAH : 0
        for (let k = 0; k < len; k++) bits.push(1)
        if (si < syms.length - 1) for (let k = 0; k < GAP; k++) bits.push(0)
      })
      if (ci < chars.length - 1) for (let k = 0; k < CGAP; k++) bits.push(0)
    })
    if (wi < words.length - 1) for (let k = 0; k < WGAP; k++) bits.push(0)
  })

  if (bits.length === 0) return null

  const W = 800; const H = 40; const maxBits = Math.min(bits.length, 200)
  const bw = (W - 8) / maxBits

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-gray-950 border border-gray-800">
      <line x1={4} y1={H - 10} x2={W - 4} y2={H - 10}
        stroke="#1f2937" strokeWidth={0.5} />
      {bits.slice(0, maxBits).map((b, i) => (
        b === 1 ? (
          <rect key={i}
            x={4 + i * bw} y={H / 2 - 10} width={bw} height={20}
            fill="#4ade80" opacity={0.9}
            style={{ filter: 'drop-shadow(0 0 2px #4ade8066)' }} />
        ) : null
      ))}
      <text x={4} y={12} fontSize={8} fill="#4b5563" fontFamily="monospace">Key timing →</text>
    </svg>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function MorseLab() {
  const [text,  setText]  = useState('CQ CQ DE VE3ABC')
  const [wpm,   setWpm]   = useState(15)
  const [pitch, setPitch] = useState(700)
  const [playing, setPlaying] = useState(false)
  const { playMorse } = useMorseAudio()

  const morse = textToMorse(text)

  const handlePlay = async () => {
    if (playing) return
    setPlaying(true)
    try {
      await playMorse(text, wpm, pitch)
    } finally {
      // Wait for audio to finish (rough estimate)
      const dotMs   = 1200 / wpm
      const charLen = morse.replace(/\s+/g, '').length
      const estMs   = charLen * dotMs * 4 + 500
      setTimeout(() => setPlaying(false), estMs)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-gray-950 text-gray-200 p-6 space-y-5">

      {/* Header */}
      <div>
        <h2 className="text-sm font-bold text-green-400 mb-1">CW / Morse Code Lab</h2>
        <p className="text-[11px] text-gray-500">
          CW (Continuous Wave) is the oldest and most efficient digital mode — a licence exam favourite.
          A dit (·) = 1 unit, dah (−) = 3 units. Character gap = 3 units, word gap = 7 units.
        </p>
      </div>

      {/* Text input */}
      <div>
        <label className="text-xs font-semibold text-gray-400 block mb-1">
          Text to encode
        </label>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-sm
                     font-mono text-white focus:outline-none focus:ring-2 focus:ring-green-500
                     uppercase"
          placeholder="CQ DE VE3ABC..."
        />
      </div>

      {/* Morse display */}
      <div>
        <label className="text-xs font-semibold text-gray-400 block mb-1">
          Morse code  <span className="text-gray-600">(· = dit, — = dah)</span>
        </label>
        <MorseDisplay morse={morse} />
      </div>

      {/* Key timing diagram */}
      <div>
        <label className="text-xs font-semibold text-gray-400 block mb-1">
          Key timing diagram
        </label>
        <KeyerDisplay morse={morse} />
      </div>

      {/* Character breakdown */}
      <div>
        <label className="text-xs font-semibold text-gray-400 block mb-2">
          Character breakdown + NATO phonetics
        </label>
        <MorseTable text={text} />
      </div>

      {/* Audio controls */}
      <div className="bg-gray-900 rounded-2xl p-4 space-y-4">
        <p className="text-xs font-bold text-green-400 uppercase tracking-widest">Audio Playback</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: `Speed: ${wpm} WPM`, val: wpm, set: setWpm, min: 5, max: 35, step: 1 },
            { label: `Pitch: ${pitch} Hz`, val: pitch, set: setPitch, min: 400, max: 900, step: 10 },
          ].map(s => (
            <div key={s.label}>
              <div className="text-xs text-gray-400 mb-1">{s.label}</div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={s.val}
                onChange={e => s.set(+e.target.value)}
                className="w-full accent-green-400" />
            </div>
          ))}
        </div>
        <button
          onClick={handlePlay}
          disabled={playing || !text.trim()}
          className={`px-6 py-2 rounded-xl font-semibold text-sm transition-all ${
            playing
              ? 'bg-green-900 text-green-400 cursor-wait animate-pulse'
              : 'bg-green-600 hover:bg-green-500 text-white disabled:opacity-40'}`}>
          {playing ? '▶ Sending…' : '▶ Send  (play audio)'}
        </button>
        <p className="text-[10px] text-gray-600">
          {wpm} WPM · {wpm >= 20 ? 'High speed — copy practice' : wpm >= 12 ? 'Standard — comfortable for most' : 'Slow — good for learning'}
        </p>
      </div>

      {/* Q-codes */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Common Q-Codes</p>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
          {[
            ['QRM', 'Man-made interference'],
            ['QRN', 'Natural static'],
            ['QRO', 'Increase power'],
            ['QRP', 'Reduce power / low power'],
            ['QRZ', 'Who is calling me?'],
            ['QSB', 'Signal fading'],
            ['QSL', 'I confirm receipt'],
            ['QSO', 'Contact / conversation'],
            ['QSY', 'Change frequency'],
            ['QTH', 'My location is…'],
            ['CQ',  'General call — any station'],
            ['73',  'Best regards (end of QSO)'],
          ].map(([code, meaning]) => (
            <div key={code} className="bg-gray-900 rounded-lg px-2 py-1.5 flex gap-2">
              <span className="text-green-400 font-bold w-8">{code}</span>
              <span className="text-gray-500">{meaning}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
