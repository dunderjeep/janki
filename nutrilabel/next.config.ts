import { existsSync } from 'node:fs'
import path from 'node:path'
import type { NextConfig } from 'next'

// Inside janki's workspace the install is one level up; in Joblowski's own repo it is here.
const inWorkspace = existsSync(path.join(__dirname, '..', 'node_modules', 'next')) && !existsSync(path.join(__dirname, 'node_modules', 'next'))
const root = inWorkspace ? path.join(__dirname, '..') : __dirname

const config: NextConfig = {
  // PGlite loads its WebAssembly and data files at run time; bundling it breaks those paths.
  serverExternalPackages: ['@electric-sql/pglite'],
  // The shared app kit is TypeScript source in a sibling workspace package.
  transpilePackages: ['@janki/app-kit'],
  turbopack: { root },
  outputFileTracingRoot: root,
  devIndicators: false,
}

export default config
