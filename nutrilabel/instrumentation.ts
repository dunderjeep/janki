/** Next calls this once when the server starts: open the database and bring it up to date. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { ready } = await import('./standalone/host')
  await ready()
}
