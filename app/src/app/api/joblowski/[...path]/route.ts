import '@/lib/joblowskiHost'

export const dynamic = 'force-dynamic'
// Drafting with Claude can take a few minutes; see maxDuration in joblowski/api.
export const maxDuration = 300

export { GET, POST, PUT, PATCH, DELETE } from 'joblowski/api'
