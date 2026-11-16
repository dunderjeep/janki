/** Next calls this once when the server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.JOBLOWSKI_ALERTS !== 'off') {
    await import('@/lib/joblowskiHost')
    const { startAlertTimer } = await import('joblowski/server')
    startAlertTimer()
  }
  // Mail: every mailbox brought in step every 15 minutes (MAIL_SYNC=off to stop it).
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.MAIL_SYNC !== 'off' && process.env.MAIL_SECRET_KEY) {
    await import('@/lib/mailHost')
    const { syncAll } = await import('mail/server')
    const g = globalThis as unknown as { __mailTimer?: NodeJS.Timeout }
    if (!g.__mailTimer) {
      let running = false
      const tick = async () => {
        if (running) return
        running = true
        try { await syncAll() } finally { running = false }
      }
      g.__mailTimer = setInterval(() => void tick(), 15 * 60_000)
      setTimeout(() => void tick(), 60_000)
    }
  }
}
