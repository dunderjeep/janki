/**
 * Runs alerts while the server is up. Each search remembers when it last ran,
 * so a restart neither loses a check nor repeats one.
 */
import { checkDueAlerts } from './search'

const FIRST_RUN_MS = 60_000
const TICK_MS = 60 * 60_000

declare global {
  var __joblowskiAlertTimer: NodeJS.Timeout | undefined
}

export function startAlertTimer(): void {
  if (globalThis.__joblowskiAlertTimer) return
  const tick = () => checkDueAlerts().catch((err) => console.error('[joblowski] alert check:', err))
  setTimeout(tick, FIRST_RUN_MS).unref()
  globalThis.__joblowskiAlertTimer = setInterval(tick, TICK_MS)
  globalThis.__joblowskiAlertTimer.unref()
}
