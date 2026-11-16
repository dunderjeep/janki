/**
 * Turns a résumé or letter from Markdown into a page. The preview and the PDF
 * both use this, so what is on screen is what gets exported.
 *
 * Raw HTML and images are refused: the PDF is drawn by a browser on the server,
 * and nothing in a document should be able to make it load or run anything.
 */
import { Marked, type Tokens } from 'marked'
import type { DocKind, DocStyle } from './types'
import { isHttpUrl } from './types'

export const BLANK_RESUME = `# Your Name

Oslo, Norway · you@example.com · +47 000 00 000 · [linkedin.com/in/you](https://linkedin.com/in/you)

## Summary

Two or three sentences on what you do and what you are looking for.

## Experience

### Job title, Company | 2023 – present

- What you did and the result it had, with a number if you have one
- Another achievement

### Earlier job title, Company | 2019 – 2023

- What you did and the result it had

## Education

### Degree, Institution | 2015 – 2019

## Skills

Skill, skill, skill
`

export const BLANK_LETTER = `Your Name
Oslo, Norway · you@example.com · +47 000 00 000

{{date}}

Dear hiring team at {{company}},

I am applying for the {{role}} position. Say why this job and this organisation in particular.

Give one example of work you have done that shows you can do what they need.

Say what you would like to happen next.

Kind regards,

Your Name
`

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const markdown = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escape(text),
    image: ({ text }: Tokens.Image) => escape(text),
    link({ href, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens)
      const safe = isHttpUrl(href) || href.startsWith('mailto:') || href.startsWith('tel:')
      return safe ? `<a href="${escape(href)}">${inner}</a>` : inner
    },
    heading({ tokens, depth }: Tokens.Heading) {
      const inner = this.parser.parseInline(tokens)
      if (depth !== 3) return `<h${depth}>${inner}</h${depth}>`
      // "### Job, Company | 2023 – present" sets the dates against the right margin.
      const split = inner.lastIndexOf(' | ')
      if (split === -1) return `<h3>${inner}</h3>`
      return `<h3><span>${inner.slice(0, split)}</span> <span class="when">${inner.slice(split + 3)}</span></h3>`
    },
  },
})

// Times New Roman and Arial, or on Linux the Liberation fonts cut to the same
// widths, so line breaks match between a phone's preview and the server's PDF.
const FONTS: Record<DocStyle, string> = {
  classic: "'Times New Roman', 'Liberation Serif', Times, serif",
  modern: "Arial, 'Liberation Sans', Helvetica, sans-serif",
}

const ACCENT: Record<DocStyle, string> = { classic: '#111827', modern: '#0c4a6e' }

function css(style: DocStyle, kind: DocKind): string {
  const size = kind === 'letter' ? '11.5pt' : style === 'classic' ? '11pt' : '10pt'
  return `
    @page { size: A4; margin: ${kind === 'letter' ? '25mm 25mm' : '16mm 18mm'}; }
    * { box-sizing: border-box; }
    html { background: #fff; }
    body { margin: 0; color: #111827; font: ${size}/1.4 ${FONTS[style]}; }
    @media screen { body { padding: ${kind === 'letter' ? '25mm' : '16mm 18mm'}; } }
    h1 { margin: 0 0 2pt; font-size: 2em; font-weight: 700; color: ${ACCENT[style]}; }
    h2 { margin: 12pt 0 4pt; padding-bottom: 2pt; border-bottom: 0.75pt solid ${ACCENT[style]}; font-size: 1.1em; font-weight: 700;
         color: ${ACCENT[style]}; text-transform: uppercase; letter-spacing: 0.04em; break-after: avoid; }
    h3 { display: flex; justify-content: space-between; gap: 12pt; margin: 7pt 0 2pt; font-size: 1em; font-weight: 700; break-after: avoid; }
    h3 .when { flex: none; font-weight: 400; }
    h4, h5, h6 { margin: 6pt 0 2pt; font-size: 1em; }
    p { margin: 0 0 ${kind === 'letter' ? '11pt' : '4pt'}; }
    ul, ol { margin: 2pt 0 5pt; padding-left: 14pt; }
    li { margin-bottom: 2pt; break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
    blockquote { margin: 0 0 6pt 8pt; }
    code { font: inherit; }
    hr { border: 0; border-top: 0.75pt solid #9ca3af; margin: 8pt 0; }
  `
}

/** Keeps single line breaks in a letter's address block and sign-off. */
const withLineBreaks = (body: string, kind: DocKind) => (kind === 'letter' ? body.replace(/(?<!\n)\n(?!\n)/g, '  \n') : body)

export function renderPage(input: { title: string; body: string; style: DocStyle; kind: DocKind }): string {
  const html = markdown.parse(withLineBreaks(input.body, input.kind), { async: false }) as string
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(input.title)}</title><style>${css(input.style, input.kind)}</style></head><body>${html}</body></html>`
}
