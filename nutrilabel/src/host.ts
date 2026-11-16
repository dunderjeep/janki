/**
 * The host: what NutriLabel needs from the app it runs inside.
 *
 * NutriLabel runs embedded in a larger app (janki) and on its own on a desktop.
 * Each host calls setNutrilabelHost() once at start-up; nothing else in
 * NutriLabel knows which host it is in. The mechanics are shared with every
 * janki app, in @janki/app-kit.
 */
import { defineHost, type BaseHost, type HostDb } from '@janki/app-kit/host'
import type { AllergenKey } from './lib/nutrients'

/** A Drizzle database holding the `nutrilabel` schema: node-postgres, PGlite, … */
export type NutrilabelDb = HostDb

/** A recipe kept elsewhere in the host, offered for import as a product's recipe. */
export type HostRecipe = {
  /** Stored on the product so it can say where it came from. */
  ref: string
  title: string
  /** Lines the host could turn into grams; the rest keep `grams: null` and say why in `note`. */
  lines: { name: string; grams: number | null; note?: string; allergens: AllergenKey[] }[]
}

export type RecipeSource = {
  /** What the import menu calls it, e.g. "Kitchen". */
  label: string
  list: (uid: string) => Promise<{ id: string; title: string; detail?: string }[]>
  get: (uid: string, id: string) => Promise<HostRecipe>
}

/** The shared database and user, plus an optional slot a host can fill or leave out. */
export type NutrilabelHost = BaseHost & {
  /** Optional: recipes the host already keeps. Without it, there is no import menu. */
  recipes?: RecipeSource
}

const slot = defineHost<NutrilabelHost>('NutriLabel')

export const setNutrilabelHost = slot.setHost
export const nutrilabelHost = slot.host
/** The host's database, looked up on each use, so modules can import it before the host is set. */
export const db: NutrilabelDb = slot.db
