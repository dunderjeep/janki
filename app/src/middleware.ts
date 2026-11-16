/**
 * Middleware: protect /srs/* and /radio.
 * Uses only the edge-safe authConfig — no Node.js modules, no DB access.
 * The JWT in the session cookie is validated cryptographically (no DB round-trip).
 *
 * /radio is gated because the Koch trainer's streak and level now live in the
 * account. Signed out it could only reach localStorage, which is exactly the
 * storage that kept losing the streak.
 *
 * /banki holds bank statements and the books built from them; /bokki the
 * business's books and receipt images; /porcupin personal photos;
 * /scatterbrain private writing and the org files it edits; /joblowski résumés and
 * the record of where they were sent; /nutrilabel the business's recipes;
 * /mail your mailboxes.
 */
import NextAuth from 'next-auth'
import { authConfig } from './auth.config'
import { NextResponse } from 'next/server'

const { auth } = NextAuth(authConfig)

const PROTECTED = ['/srs', '/radio', '/banki', '/bokki', '/porcupin', '/scatterbrain', '/joblowski', '/nutrilabel', '/dough', '/next', '/daily', '/mail']

export default auth((req) => {
  const { pathname } = req.nextUrl

  if (!req.auth && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.url)
    return NextResponse.redirect(loginUrl)
  }
})

export const config = {
  matcher: ['/srs/:path*', '/radio/:path*', '/banki/:path*', '/bokki/:path*', '/porcupin/:path*', '/scatterbrain/:path*', '/joblowski/:path*', '/nutrilabel/:path*', '/dough/:path*', '/next/:path*', '/daily/:path*', '/mail/:path*'],
}
