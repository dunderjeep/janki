/** Next calls this once when the server starts: open the database, then run alerts every so often. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { ready } = await import('./standalone/host')
  await ready()
  if (process.env.JOBLOWSKI_ALERTS !== 'off') {
    const { startAlertTimer } = await import('joblowski/server')
    startAlertTimer()
  }
}
