import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the production build in its own directory. `next dev` and `next start`
  // otherwise share `.next`, and a running dev server rewrites the shared
  // manifests — which silently reduces app-paths-manifest.json to whatever dev
  // has compiled so far, leaving the production server serving 404s for every
  // route it no longer knows about. The systemd unit sets NEXT_DIST_DIR.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The apps (../joblowski, ../mail, ../notes, ../nutrilabel) and their kit (../app-kit) are workspace
  // packages of TypeScript source, so Next compiles them, and the workspace root (one level up) is the project root.
  transpilePackages: ['@janki/app-kit', 'joblowski', 'mail', 'notes', 'nutrilabel'],
  // The IMAP client and mail parser are plain Node packages: load them, don't bundle them.
  serverExternalPackages: ['imapflow', 'mailparser'],
  turbopack: { root: path.join(__dirname, '..') },
  // Jobbi was renamed Joblowski; old bookmarks and links still land.
  async redirects() {
    return [
      { source: '/jobbi', destination: '/joblowski', permanent: true },
      { source: '/jobbi/:path*', destination: '/joblowski/:path*', permanent: true },
    ]
  },
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Don't gate production builds on lint style rules — `next build` treats every
  // ESLint error as fatal, and 58 of them (mostly no-explicit-any and
  // react/no-unescaped-entities) would block deploying a working app.
  // Type checking still runs and still fails the build; run lint separately
  // with `npm run lint`.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
