/**
 * The labels, drawn with their own CSS (not Tailwind) so the print window gets
 * exactly what the screen shows, whatever host the app is in.
 *
 * Standard: the bilingual standard format (Directory of NFt formats, figures 3.x),
 * laid out like the NutriLabel CA workbook's "CA Standard" sheet.
 * Package: the workbook's "Package Label" — product panel left, table right.
 * Norwegian: the EU nutrition declaration in tabular form (Regulation (EU)
 * 1169/2011, Annex XV) and a package label with the particulars of Article 9.
 */
import { fmt, servingText, type Facts, type Product } from '../lib/engine'
import { emphasisParts, noNumber, type EuFacts, type EuKey } from '../lib/eu'
import type { Settings } from '../lib/store'

export const LABEL_CSS = `
.nl-nft { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; border: 1px solid #000;
  padding: 3px 5px 4px; width: 62mm; box-sizing: border-box; font-size: 8.5pt; line-height: 1.25; }
.nl-nft .t { font-size: 13pt; font-weight: 700; line-height: 1.1; }
.nl-nft .serv { font-size: 8.5pt; }
.nl-nft .row { display: flex; justify-content: space-between; align-items: flex-end; gap: 6px; border-top: 1px solid #000; padding: 1px 0; }
.nl-nft .row.thick { border-top-width: 3px; }
.nl-nft .row.none { border-top: none; }
.nl-nft .b { font-weight: 700; }
.nl-nft .in { padding-left: 1.1em; }
.nl-nft .cal { font-size: 11pt; font-weight: 700; }
.nl-nft .dvh { font-size: 6.5pt; text-align: right; line-height: 1.15; }
.nl-nft .pct { white-space: nowrap; }
.nl-nft .foot { border-top: 3px solid #000; font-size: 6.5pt; padding-top: 2px; line-height: 1.3; }
.nl-pack { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; display: grid;
  grid-template-columns: 1fr 62mm; gap: 4mm; width: 132mm; padding: 3mm; box-sizing: border-box; font-size: 7.5pt; line-height: 1.3; border: 1px dashed #bbb; }
.nl-pack .logo { border: 1px solid #aaa; height: 18mm; display: flex; align-items: center; justify-content: center; color: #999; font-style: italic; font-size: 7pt; overflow: hidden; }
.nl-pack .logo img { max-height: 100%; max-width: 100%; }
.nl-pack .name { font-size: 13pt; font-weight: 700; text-align: center; text-transform: uppercase; margin-top: 2mm; line-height: 1.1; }
.nl-pack .namefr { font-size: 10pt; font-weight: 700; text-align: center; margin-bottom: 2mm; }
.nl-pack .net { font-weight: 700; margin-bottom: 1.5mm; }
.nl-pack p { margin: 0 0 1.5mm; }
.nl-pack .contains { font-weight: 700; }
.nl-pack .store { text-align: right; font-weight: 700; text-transform: uppercase; margin-top: 1.5mm; }
.nl-pack .prep { grid-column: 1 / -1; text-align: center; font-size: 7pt; }
.nl-eu { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; border: 1px solid #000;
  padding: 3px 5px 4px; min-width: 58mm; box-sizing: border-box; font-size: 8pt; line-height: 1.25; display: inline-block; }
.nl-eu table { border-collapse: collapse; width: 100%; }
.nl-eu th, .nl-eu td { padding: 1px 3px; vertical-align: top; text-align: right; white-space: nowrap; }
.nl-eu th:first-child, .nl-eu td:first-child { text-align: left; white-space: normal; }
.nl-eu thead th { font-weight: 700; border-bottom: 2px solid #000; vertical-align: bottom; }
.nl-eu tbody tr { border-top: 1px solid #000; }
.nl-eu tbody tr.sub { border-top: none; }
.nl-eu tr.sub td:first-child { padding-left: 1em; }
.nl-eu .t { font-size: 10pt; font-weight: 700; margin-bottom: 2px; }
.nl-eu .foot { font-size: 6.5pt; border-top: 1px solid #000; padding-top: 2px; margin-top: 1px; }
.nl-packno { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; display: grid;
  grid-template-columns: 1fr auto; gap: 4mm; width: 132mm; padding: 3mm; box-sizing: border-box; font-size: 7.5pt; line-height: 1.3; border: 1px dashed #bbb; }
.nl-packno .logo { border: 1px solid #aaa; height: 18mm; display: flex; align-items: center; justify-content: center; color: #999; font-style: italic; font-size: 7pt; overflow: hidden; }
.nl-packno .logo img { max-height: 100%; max-width: 100%; }
.nl-packno .name { font-size: 13pt; font-weight: 700; text-align: center; text-transform: uppercase; margin: 2mm 0; line-height: 1.1; }
.nl-packno p { margin: 0 0 1.5mm; }
.nl-packno .net { font-weight: 700; }
.nl-packno .store { font-weight: 700; margin-top: 1.5mm; }
.nl-packno .prep { grid-column: 1 / -1; text-align: center; font-size: 7pt; }
`

const Pct = ({ v }: { v: number | undefined }) => <span className="pct">{v == null ? '' : `${v} %`}</span>

/** The bilingual standard Nutrition Facts table. Blank until the serving and recipe are complete. */
export function StandardTable({ product, facts }: { product: Product; facts: Facts }) {
  const d = facts.declared
  const a = (k: keyof NonNullable<Facts['declared']>) => (d ? fmt(d[k].declared) : '–')
  const dv = facts.dv ?? undefined
  return (
    <div className="nl-nft">
      <div className="t">Nutrition Facts</div>
      <div className="t">Valeur nutritive</div>
      <div className="serv">{servingText(product, 'en')}</div>
      <div className="serv" style={{ paddingBottom: 1 }}>{servingText(product, 'fr')}</div>
      <div className="row">
        <span className="cal">Calories {a('cal')}</span>
        <span className="dvh"><b>% Daily Value*</b><br />% valeur quotidienne*</span>
      </div>
      <div className="row thick"><span><b>Fat / Lipides</b> {a('fat')} g</span><Pct v={dv?.fat} /></div>
      <div className="row none">
        <span className="in">Saturated / saturés {a('sat')} g<br />+ Trans / trans {a('trans')} g</span><Pct v={dv?.sattrans} />
      </div>
      <div className="row"><span><b>Carbohydrate / Glucides</b> {a('carb')} g</span></div>
      <div className="row none"><span className="in">Fibre / Fibres {a('fibre')} g</span><Pct v={dv?.fibre} /></div>
      <div className="row none"><span className="in">Sugars / Sucres {a('sugars')} g</span><Pct v={dv?.sugars} /></div>
      <div className="row"><span><b>Protein / Protéines</b> {a('protein')} g</span></div>
      <div className="row"><span><b>Cholesterol / Cholestérol</b> {a('chol')} mg</span></div>
      <div className="row"><span><b>Sodium</b> {a('sodium')} mg</span><Pct v={dv?.sodium} /></div>
      <div className="row thick"><span>Potassium {a('potassium')} mg</span><Pct v={dv?.potassium} /></div>
      <div className="row"><span>Calcium {a('calcium')} mg</span><Pct v={dv?.calcium} /></div>
      <div className="row"><span>Iron / Fer {a('iron')} mg</span><Pct v={dv?.iron} /></div>
      <div className="foot">
        *5% or less is <b>a little</b>, 15% or more is <b>a lot</b><br />
        *5 % ou moins c&apos;est <b>peu</b>, 15 % ou plus c&apos;est <b>beaucoup</b>
      </div>
    </div>
  )
}

/** The whole package label: names, net quantity, ingredients, allergens, storage, who made it, and the table. */
export function PackageLabel({ product, facts, settings, logo }: { product: Product; facts: Facts; settings: Settings; logo?: string }) {
  const prep = product.preparedBy || [settings.businessName, settings.address].filter(Boolean).join(', ')
  return (
    <div className="nl-pack">
      <div>
        <div className="logo">{logo ? <img src={logo} alt="" /> : 'logo'}</div>
        <div className="name">{product.nameEn || product.name}{product.price ? `  $${product.price}` : ''}</div>
        {product.nameFr && <div className="namefr">{product.nameFr}</div>}
        {product.netQuantity && <div className="net">NET / NET : {product.netQuantity}</div>}
        {facts.ingredientsEn && <p><b>Ingredients:</b> {facts.ingredientsEn}.</p>}
        {facts.ingredientsFr && <p><b>Ingrédients :</b> {facts.ingredientsFr}.</p>}
        {facts.containsEn && (
          <p className="contains">Contains: {facts.containsEn}.{facts.containsFr && `  Contient : ${facts.containsFr}.`}</p>
        )}
      </div>
      <div>
        <StandardTable product={product} facts={facts} />
        {product.storageEn && <div className="store">{product.storageEn}</div>}
        {product.storageFr && <div className="store" style={{ marginTop: 0 }}>{product.storageFr}</div>}
      </div>
      {prep && <div className="prep">Prepared by / Préparé par : {prep}</div>}
    </div>
  )
}

/** Opens the label alone in a new window and prints it, so the host's page chrome never reaches the paper. */
export function printLabel(el: HTMLElement | null, title: string) {
  if (!el) return
  const w = window.open('', '_blank', 'width=700,height=600')
  if (!w) return alert('Allow pop-ups for this site to print the label.')
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    ${LABEL_CSS}
    @page { margin: 10mm; }
    body { margin: 0; padding: 10mm; background: #fff; }
    @media print { body { padding: 0; } .nl-pack { border: none; } }
  </style></head><body>${el.innerHTML}</body></html>`)
  w.document.close()
  w.focus()
  // Give the images (a logo) a moment to load before the print dialog freezes the page.
  setTimeout(() => w.print(), 300)
}

/** Text with *stars* printed in bold: how an EU label emphasises allergens. */
export function Emphasised({ text }: { text: string }) {
  return <>{emphasisParts(text).map((p, i) => (p.bold ? <b key={i}>{p.text}</b> : <span key={i}>{p.text}</span>))}</>
}

const ROWS: { key: EuKey; label: string; sub?: boolean }[] = [
  { key: 'fat', label: 'Fett' },
  { key: 'sat', label: 'hvorav mettede fettsyrer', sub: true },
  { key: 'carb', label: 'Karbohydrat' },
  { key: 'sugars', label: 'hvorav sukkerarter', sub: true },
  { key: 'fibre', label: 'Kostfiber' },
  { key: 'protein', label: 'Protein' },
  { key: 'salt', label: 'Salt' },
]

/** The Norwegian nutrition declaration: per 100 g (or ml), and per portion with %RI when chosen. */
export function NorwegianTable({ product, eu }: { product: Product; eu: EuFacts }) {
  const per = `Per 100 ${eu.basis}`
  const portion = eu.portionAmount != null
    ? `Per porsjon (${[product.hmNo, `${noNumber(eu.portionAmount, Number.isInteger(eu.portionAmount) ? 0 : 1)} ${eu.basis}`].filter(Boolean).join(', ')})`
    : null
  const cell = (col: EuFacts['col100'], k: EuKey) => (col ? `${col[k].text} g` : '–')
  const energy = (col: EuFacts['col100']) => (col ? <>{col.kj.text} kJ /<br />{col.kcal.text} kcal</> : '–')
  const ri = (k: EuKey) => (eu.ri?.[k] == null ? '' : `${eu.ri[k] === 0 && (eu.colPortion?.[k].raw ?? 0) > 0 ? '<1' : eu.ri[k]} %`)
  const rows = ROWS.filter((r) => r.key !== 'fibre' || eu.showFibre)
  return (
    <div className="nl-eu">
      <div className="t">Næringsdeklarasjon</div>
      <table>
        <thead>
          <tr>
            <th />
            <th>{per}</th>
            {portion && <th>{portion}</th>}
            {portion && <th>%RI*</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Energi</td>
            <td>{energy(eu.col100)}</td>
            {portion && <td>{energy(eu.colPortion)}</td>}
            {portion && <td>{ri('kj')}</td>}
          </tr>
          {rows.map((r) => (
            <tr key={r.key} className={r.sub ? 'sub' : ''}>
              <td>{r.label}</td>
              <td>{cell(eu.col100, r.key)}</td>
              {portion && <td>{cell(eu.colPortion, r.key)}</td>}
              {portion && <td>{ri(r.key)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {portion && <div className="foot">*Referanseinntak for en gjennomsnittlig voksen (8400 kJ / 2000 kcal).</div>}
    </div>
  )
}

/** "Nettovekt" for a weight, "Nettoinnhold" for a volume. */
const netWord = (q: string) => (/\b(m?l|cl|dl|liter)\b/i.test(q) ? 'Nettoinnhold' : 'Nettovekt')

/** The Norwegian package label: name, ingredients with allergens in bold, net quantity, storage, date, producer, and the table. */
export function PackageLabelNo({ product, eu, settings, logo }: { product: Product; eu: EuFacts; settings: Settings; logo?: string }) {
  const prep = product.preparedBy || [settings.businessName, settings.address].filter(Boolean).join(', ')
  return (
    <div className="nl-packno">
      <div>
        <div className="logo">{logo ? <img src={logo} alt="" /> : 'logo'}</div>
        <div className="name">{product.nameNo || product.name}{product.price ? `  kr ${product.price}` : ''}</div>
        {eu.ingredients && <p><b>Ingredienser:</b> <Emphasised text={eu.ingredients} />.</p>}
        {product.allergyNoteNo && <p>{product.allergyNoteNo}</p>}
        {product.netQuantity && <p className="net">{netWord(product.netQuantity)}: {product.netQuantity}</p>}
        {product.storageNo && <p className="store">{product.storageNo}</p>}
        {product.durabilityNo && <p>{product.durabilityNo}</p>}
      </div>
      <div><NorwegianTable product={product} eu={eu} /></div>
      {prep && <div className="prep">Produsent: {prep}</div>}
    </div>
  )
}
