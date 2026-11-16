/**
 * NutriLabel's server side, for a host app: set the host, load a page's data.
 * The HTTP API is in 'nutrilabel/api'; the label arithmetic in 'nutrilabel/engine'.
 */
export {
  setNutrilabelHost, nutrilabelHost,
  type NutrilabelHost, type NutrilabelDb, type RecipeSource, type HostRecipe,
} from './host'
export { nutrilabelPageData } from './api'
export { NutrilabelError, listIngredients, listProducts, getSettings, type Settings } from './lib/store'
