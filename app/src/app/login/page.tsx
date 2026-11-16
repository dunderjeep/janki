import { signIn } from '@/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/auth'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const { callbackUrl, error } = await searchParams

  // Sign-in must start on the origin Auth.js is pinned to (AUTH_URL). The PKCE
  // cookie lands wherever sign-in begins, but Google always returns to AUTH_URL,
  // so starting on e.g. localhost:3001 yields a cookie-less callback
  // ("pkceCodeVerifier value could not be parsed"). Bounce there first.
  // tailscale serve forwards the browser's host as X-Forwarded-Host.
  const pinned = process.env.AUTH_URL ? new URL(process.env.AUTH_URL) : null
  if (pinned) {
    const h = await headers()
    const host = h.get('x-forwarded-host') ?? h.get('host')
    if (host && host !== pinned.host) {
      const q = new URLSearchParams()
      if (callbackUrl) {
        try {
          const u = new URL(callbackUrl, pinned)
          q.set('callbackUrl', u.pathname + u.search)
        } catch {}
      }
      if (error) q.set('error', error)
      const qs = q.toString()
      redirect(new URL(`/login${qs ? `?${qs}` : ''}`, pinned).toString())
    }
  }

  const session = await auth()

  if (session?.user) {
    redirect(callbackUrl ?? '/srs')
  }

  const dest = callbackUrl ?? '/srs'

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-md p-10 flex flex-col items-center gap-6 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-800">Janki</h1>
        <p className="text-gray-500 text-sm text-center">
          Sign in to access your flashcard decks.
        </p>

        {error && (
          <p className="text-red-600 text-sm text-center w-full bg-red-50 rounded-lg px-4 py-2">
            {error === 'CredentialsSignin'
              ? 'Invalid handle or app password.'
              : 'Sign-in failed. Please try again.'}
          </p>
        )}

        {/* Google */}
        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: dest })
          }}
        >
          <button
            type="submit"
            className="flex items-center gap-3 px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>
        </form>

        <div className="flex items-center w-full gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Bluesky */}
        <form
          className="flex flex-col gap-3 w-full"
          action={async (formData: FormData) => {
            'use server'
            await signIn('bluesky', {
              handle: formData.get('handle'),
              appPassword: formData.get('appPassword'),
              redirectTo: dest,
            })
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Bluesky handle</span>
            <input
              name="handle"
              type="text"
              placeholder="yourname.bsky.social"
              autoComplete="username"
              required
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">App Password</span>
            <input
              name="appPassword"
              type="password"
              placeholder="xxxx-xxxx-xxxx-xxxx"
              autoComplete="current-password"
              required
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>
          <p className="text-xs text-gray-400">
            Create one at{' '}
            <span className="font-medium">
              Bluesky → Settings → Privacy &amp; Security → App Passwords
            </span>
          </p>
          <button
            type="submit"
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#0085ff] hover:bg-[#006ecc] text-white font-medium transition-colors"
          >
            <svg viewBox="0 0 360 320" className="w-5 h-5 fill-current" aria-hidden="true">
              {/* Bluesky butterfly */}
              <path d="M180 142C164 110 120 51 78 23c-40-27-86-14-76 45 5 30 27 114 43 141 26 44 78 61 113 74 14 5 26 10 22 18-3-8-15-13-29-18C96 270 45 253 19 209 2 182-19 98-24 68-33 9 13-4 52 23c41 28 86 87 102 119h13c16-32 61-91 102-119 39-27 85-14 76 45-5 30-27 114-43 141-26 44-78 61-113 74-14 5-26 10-22 18 3-8 15-13 29-18 36-13 87-30 113-74 16-27 38-111 43-141 9-59-37-72-76-45z" />
            </svg>
            Sign in with Bluesky
          </button>
        </form>
      </div>
    </main>
  )
}
