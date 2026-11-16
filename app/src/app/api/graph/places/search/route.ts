import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { findPlaceNodeByPlaceId, createPlaceNode, addLocationEdge } from '@/lib/graphStore'

const PLACES_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ?? ''

type PlaceResult = {
  placeId: string
  name: string
  formattedAddress: string
  lat: number
  lng: number
  googleTypes: string[]
}

async function searchGooglePlaces(query: string): Promise<PlaceResult[]> {
  if (!PLACES_KEY) return []
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('query', query)
  url.searchParams.set('key', PLACES_KEY)
  const res = await fetch(url.toString())
  if (!res.ok) return []
  const data = await res.json() as {
    status: string;
    results: {
      place_id: string;
      name: string;
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
      types: string[]
    }[]
  }
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return []
  return (data.results ?? []).slice(0, 5).map(r => ({
    placeId: r.place_id,
    name: r.name,
    formattedAddress: r.formatted_address,
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    googleTypes: r.types ?? [],
  }))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json() as {
    action?: string
    query?: string
    subjectNodeId?: string
    place?: PlaceResult
    edgeType?: string
    validFrom?: string
    validTo?: string
    notes?: string
  }

  if (!body.action || body.action === 'search') {
    if (!body.query) return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    const places = await searchGooglePlaces(body.query)
    return NextResponse.json({ places })
  }

  if (body.action === 'connect') {
    const { subjectNodeId, place, edgeType, validFrom, validTo, notes } = body
    if (!subjectNodeId || !place || !edgeType) {
      return NextResponse.json({ error: 'Missing subjectNodeId, place, or edgeType' }, { status: 400 })
    }

    // Find or create place node
    let placeNode = await findPlaceNodeByPlaceId(uid, place.placeId)
    if (!placeNode) {
      placeNode = await createPlaceNode(uid, place)
    }

    // Create location edge
    const locationEdgeTypes = ['LIVES_AT', 'WORKS_AT', 'STUDIES_AT', 'VISITS', 'LOCATED_AT']
    if (!locationEdgeTypes.includes(edgeType)) {
      return NextResponse.json({ error: 'Invalid edge type' }, { status: 400 })
    }

    const edge = await addLocationEdge(
      uid,
      subjectNodeId,
      placeNode.id,
      edgeType as 'LIVES_AT' | 'WORKS_AT' | 'STUDIES_AT' | 'VISITS' | 'LOCATED_AT',
      { validFrom, validTo, notes }
    )

    return NextResponse.json({ placeNode, edge }, { status: 201 })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
