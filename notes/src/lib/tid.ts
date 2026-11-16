/**
 * TIDs: ATProto's record keys. 13 characters of base32-sortable text holding
 * a microsecond timestamp and a 10-bit clock id, so keys sort by creation time.
 * https://atproto.com/specs/tid
 */
const S32 = '234567abcdefghijklmnopqrstuvwxyz'

export const TID = /^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/

const CLOCK = Math.floor(Math.random() * 1024)

// BigInt() rather than 10n-style literals: janki compiles for a target older than ES2020.
const N0 = BigInt(0), N1 = BigInt(1), N5 = BigInt(5), N10 = BigInt(10), N31 = BigInt(31), N1023 = BigInt(1023), N1000 = BigInt(1000)

/** The TID for a moment (in microseconds since the epoch) and a clock id. */
export function tidAt(micros: bigint, clock = CLOCK): string {
  let n = (micros << N10) | (BigInt(clock) & N1023)
  let s = ''
  for (let i = 0; i < 13; i++) {
    s = S32[Number(n & N31)] + s
    n >>= N5
  }
  return s
}

/** When a TID was made, in milliseconds since the epoch. */
export function tidTime(tid: string): number {
  let n = N0
  for (const ch of tid) n = (n << N5) | BigInt(S32.indexOf(ch))
  return Number((n >> N10) / N1000)
}

let last = N0

/** A fresh TID, never repeating or going backwards within this process. */
export function nextTid(): string {
  let micros = BigInt(Date.now()) * N1000
  if (micros <= last) micros = last + N1
  last = micros
  return tidAt(micros)
}

/**
 * A TID for a past moment, such as when an imported file was first written.
 * `taken` holds keys already used, so two files from the same second still get
 * distinct keys in the same order.
 */
export function tidFor(ms: number, taken: Set<string>): string {
  let micros = BigInt(Math.max(0, Math.floor(ms))) * N1000
  let key = tidAt(micros)
  while (taken.has(key)) {
    micros += N1
    key = tidAt(micros)
  }
  taken.add(key)
  return key
}
