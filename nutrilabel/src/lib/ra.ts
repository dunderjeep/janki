/**
 * Health Canada's Table of Reference Amounts for Food (October 2024): the
 * serving each kind of food is measured against. Small enough for the browser.
 */
import data from '../../data/reference-amounts.json'
import type { ReferenceAmount } from './engine'

export const REFERENCE_AMOUNTS = data as ReferenceAmount[]
