/**
 * Multiplicative spaced-repetition scheduling.
 *
 * SrsObject field mapping (repurposed from original FSRS fields):
 *   stability  → current interval in days  (0 = never reviewed)
 *   difficulty → ease factor               (EF, range efMin – efMax)
 *
 * Grade semantics:
 *   again → requeue in session (no schedule change — handled by StudyUI)
 *   hard  → interval × 0.6,        EF − efHardLoss
 *   good  → interval × EF,         EF − efDecay
 *   easy  → interval × EF × 1.5,   EF + efEasyGain
 *
 * First review fixed intervals: hard=1d  good=3d  easy=7d
 * Default EF (1.75) decays to floor (1.30) over ~12 Good reviews,
 * reaching the 365-day cap with smooth progression throughout.
 */
import type { SrsObject, Grade, FsrsParams } from '@/db/schema/janki'

// Algorithm defaults — all overridable via FsrsParams
export const ALGO_DEFAULTS = {
  maxIntervalDays: 365,
  initEF:          1.75,
  efDecay:         0.04,
  efHardLoss:      0.15,
  efEasyGain:      0.10,
  efMin:           1.30,
  efMax:           2.50,
}

export type ScheduleResult = SrsObject

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x))
}

function dueInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

type AlgoConfig = typeof ALGO_DEFAULTS

function resolveConfig(params: FsrsParams): AlgoConfig {
  return {
    maxIntervalDays: params.maxIntervalDays ?? ALGO_DEFAULTS.maxIntervalDays,
    initEF:          params.initEF          ?? ALGO_DEFAULTS.initEF,
    efDecay:         params.efDecay         ?? ALGO_DEFAULTS.efDecay,
    efHardLoss:      params.efHardLoss      ?? ALGO_DEFAULTS.efHardLoss,
    efEasyGain:      params.efEasyGain      ?? ALGO_DEFAULTS.efEasyGain,
    efMin:           params.efMin           ?? ALGO_DEFAULTS.efMin,
    efMax:           params.efMax           ?? ALGO_DEFAULTS.efMax,
  }
}

/** Normalise the EF field. Legacy FSRS cards stored difficulty in 1–10; treat those as fresh. */
function normalizeEF(raw: number, cfg: AlgoConfig): number {
  if (!raw || raw > cfg.efMax || raw < cfg.efMin) return cfg.initEF
  return raw
}

function applyGrade(
  interval: number,
  ef: number,
  grade: Grade,
  cfg: AlgoConfig,
): [number, number] {
  if (grade === 'hard') {
    return [
      Math.min(Math.max(1, Math.round(interval * 0.6)), cfg.maxIntervalDays),
      clamp(ef - cfg.efHardLoss, cfg.efMin, cfg.efMax),
    ]
  }
  if (grade === 'good') {
    return [
      Math.min(Math.max(1, Math.round(interval * ef)), cfg.maxIntervalDays),
      clamp(ef - cfg.efDecay, cfg.efMin, cfg.efMax),
    ]
  }
  // easy
  return [
    Math.min(Math.max(1, Math.round(interval * ef * 1.5)), cfg.maxIntervalDays),
    clamp(ef + cfg.efEasyGain, cfg.efMin, cfg.efMax),
  ]
}

// ── public API ────────────────────────────────────────────────────────────────

export function scheduleNext(
  current: SrsObject,
  grade: Grade,
  params: FsrsParams = {},
): ScheduleResult {
  // "Again" = requeue in session. StudyUI handles the re-insertion;
  // the schedule itself does not change.
  if (grade === 'again') {
    return { ...current, lastReviewedAt: new Date().toISOString() }
  }

  const now = new Date().toISOString()
  const cfg = resolveConfig(params)
  const { state, stability: interval, difficulty: rawEF, reps, lapses } = current
  const ef = normalizeEF(rawEF, cfg)

  // First review (new / learning / relearning → straight to review)
  if (state !== 'review') {
    const firstInterval = grade === 'hard' ? 1 : grade === 'good' ? 3 : 7
    const firstEF = grade === 'easy' ? clamp(ef + cfg.efEasyGain, cfg.efMin, cfg.efMax) : ef
    const capped = Math.min(firstInterval, cfg.maxIntervalDays)
    return {
      state: 'review',
      stability: capped,
      difficulty: firstEF,
      reps: reps + 1,
      lapses,
      dueAt: dueInDays(capped),
      lastReviewedAt: now,
    }
  }

  // Subsequent review
  const [newInterval, newEF] = applyGrade(Math.max(interval, 1), ef, grade, cfg)
  return {
    state: 'review',
    stability: newInterval,
    difficulty: newEF,
    reps: reps + 1,
    lapses,
    dueAt: dueInDays(newInterval),
    lastReviewedAt: now,
  }
}

export function previewIntervals(current: SrsObject, params: FsrsParams = {}): Record<Grade, string> {
  const result = {} as Record<Grade, string>
  for (const g of ['again', 'hard', 'good', 'easy'] as Grade[]) {
    if (g === 'again') { result[g] = 'now'; continue }
    const next = scheduleNext(current, g, params)
    const days = Math.round((new Date(next.dueAt).getTime() - Date.now()) / 86_400_000)
    result[g] = `${days}d`
  }
  return result
}

export function scheduleCustom(current: SrsObject, days: number): ScheduleResult {
  const next = scheduleNext(current, 'good')
  return { ...next, dueAt: dueInDays(days) }
}

/**
 * Full reset — used by the "Reset schedule" button.
 * Increments lapses, returns card to new state due tomorrow.
 */
export function scheduleAgainTomorrow(current: SrsObject): ScheduleResult {
  return {
    ...newCardState(),
    lapses: current.lapses + 1,
    dueAt: dueInDays(1),
    lastReviewedAt: new Date().toISOString(),
  }
}

export function newCardState(): SrsObject {
  return {
    state: 'new',
    stability: 0,
    difficulty: ALGO_DEFAULTS.initEF,
    reps: 0,
    lapses: 0,
    dueAt: new Date().toISOString(),
    lastReviewedAt: null,
  }
}
