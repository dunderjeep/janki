import { NextRequest, NextResponse } from 'next/server'

const PUBCHEM = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound'
const PROPS = 'MolecularFormula,MolecularWeight,IUPACName,CanonicalSMILES,IsomericSMILES,InChI,XLogP,HBondDonorCount,HBondAcceptorCount,RotatableBondCount,TPSA'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const name   = searchParams.get('name')
  const smiles = searchParams.get('smiles')
  const cid    = searchParams.get('cid')
  const type   = searchParams.get('type') ?? 'info'   // 'info' | 'sdf3d'

  if (!name && !smiles && !cid) {
    return NextResponse.json({ error: 'Provide name, smiles, or cid' }, { status: 400 })
  }

  const by = cid ? 'cid' : name ? 'name' : 'smiles'
  const id = encodeURIComponent((cid ?? name ?? smiles)!)

  if (type === 'sdf3d') {
    try {
      const res = await fetch(`${PUBCHEM}/${by}/${id}/SDF?record_type=3d`, {
        headers: { Accept: 'chemical/x-mdl-sdfile' },
        next: { revalidate: 86400 },
      })
      if (!res.ok) return NextResponse.json({ error: 'No 3D structure found' }, { status: 404 })
      const sdf = await res.text()
      return new NextResponse(sdf, { headers: { 'Content-Type': 'text/plain' } })
    } catch {
      return NextResponse.json({ error: 'PubChem unreachable' }, { status: 502 })
    }
  }

  try {
    const res = await fetch(`${PUBCHEM}/${by}/${id}/property/${PROPS}/JSON`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) return NextResponse.json({ error: 'Compound not found' }, { status: 404 })
    const json = await res.json()
    const p = json.PropertyTable?.Properties?.[0]
    if (!p) return NextResponse.json({ error: 'No data' }, { status: 404 })

    return NextResponse.json({
      cid:           p.CID,
      formula:       p.MolecularFormula,
      weight:        parseFloat(p.MolecularWeight),
      iupacName:     p.IUPACName,
      canonicalSmiles: p.CanonicalSMILES,
      isomericSmiles:  p.IsomericSMILES,
      inchi:         p.InChI,
      logP:          p.XLogP,
      hbDonors:      p.HBondDonorCount,
      hbAcceptors:   p.HBondAcceptorCount,
      rotatableBonds:p.RotatableBondCount,
      tpsa:          p.TPSA,
    })
  } catch {
    return NextResponse.json({ error: 'PubChem API error' }, { status: 502 })
  }
}
