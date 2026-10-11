// Node's plain ESM resolver can't follow Next.js's own bare `next/*` subpath exports (the
// `next` package has no "exports" map, so e.g. `next/server` only resolves through Next's own
// webpack/Turbopack resolver, not plain Node) or this project's `@/*` tsconfig path alias.
// This loader exists solely so route handlers and server components that import `next/server`,
// `next/headers`, `next/navigation`, `next/link`, etc. and use the `@/...` alias can be
// `import()`-ed directly in a plain `node --test` run, for genuine route/page-level regression
// tests instead of only unit-testing their helpers. Test infrastructure only — nothing here
// changes, mocks, or reimplements any application behavior.
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('next/')) {
    try {
      return await nextResolve(specifier, context)
    } catch (error) {
      for (const suffix of ['.js', '/index.js']) {
        try {
          return await nextResolve(`${specifier}${suffix}`, context)
        } catch {
          // try the next suffix
        }
      }
      throw error
    }
  }

  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2)
    for (const ext of ['', '.ts', '.tsx']) {
      const candidate = `${ROOT}${rel}${ext}`
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).toString(), context)
      }
    }
  }

  return nextResolve(specifier, context)
}
