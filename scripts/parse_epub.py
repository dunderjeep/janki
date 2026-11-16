#!/usr/bin/env python3
"""
parse_epub.py — Extract structured course data from a How to Prove It epub.

Usage:
  python3 scripts/parse_epub.py <path/to/book.epub> [--chapter N]

Outputs JSON to stdout with both problems and reading content blocks.
"""

import sys
import json
import zipfile
import re
from html.parser import HTMLParser

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

# Tags that delimit a complete block of content (flush the buffer on close)
FLUSH_TAGS = {'p', 'h1', 'h2', 'h3', 'li'}

# CSS classes that mark reading content paragraphs
READING_PARA_CLASSES = {
    'Para', 'Para1', 'ParaIndent', 'ParaIndent1',
    'Number_noind', 'Number1', 'Left0', 'Para-cr',
}

# Classes that introduce examples / definitions / theorems
THEOREM_CLASSES = {'Theorem', 'Theorem-c'}

# Classes for indented argument forms, quoted text
INDENTED_CLASSES = {'Left-r', 'ParaIndent1', 'Center'}

# Classes for numbered list items inside examples
LIST_ITEM_CLASSES = {'Number', 'Number1', 'Number_noind', 'Number_ind', 'Number1-a'}

# Exercise problem classes — skip these in reading mode
EXERCISE_CLASSES = {'Number0', 'Alpha'}

# Image/equation classes
EQUATION_CLASSES = {'EquationAsImage', 'EquationAsImage-l'}
FIGURE_CLASSES   = {'Figure', 'Image'}


def strip_tags(html: str) -> str:
    """Strip HTML tags and collapse whitespace to plain text."""
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def clean_html(html: str) -> str:
    """Remove epub-specific noise from HTML before storing."""
    # Remove pagebreak spans
    html = re.sub(r'<span epub:type="pagebreak"[^/]*/>', '', html)
    # Collapse extra whitespace around tags
    html = re.sub(r'\s{2,}', ' ', html)
    return html.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Problem parser (exercises at end of each section)
# ─────────────────────────────────────────────────────────────────────────────

class SectionParser(HTMLParser):
    def __init__(self, chapter_num: int):
        super().__init__()
        self.chapter_num = chapter_num
        self.skip = False
        self.buffer: list[str] = []
        self.sections: list[dict] = []
        self.current_section: dict | None = None
        self.current_problem: dict | None = None
        self.current_subpart: dict | None = None
        self.in_subparts = False

    def _flush(self) -> str:
        text = ' '.join(''.join(self.buffer).split())
        self.buffer = []
        return text

    def handle_starttag(self, tag, attrs):
        ad = dict(attrs)
        if tag in ('script', 'style'):
            self.skip = True
            return
        if tag == 'img':
            self.buffer.append(f"[img:{ad.get('src', '')}]")
            return

        cls = ad.get('class', '')
        eid = ad.get('id', '')

        if tag == 'h2' and re.match(r'head\d+-\d+', eid):
            self.buffer = []
            m = re.match(r'head(\d+)-(\d+)', eid)
            self.current_section = {
                'id': eid,
                'number': f"{m.group(1)}.{m.group(2)}",
                'chapter': int(m.group(1)),
                'section_num': int(m.group(2)),
                'title': '',
                'problems': [],
            }
            self.sections.append(self.current_section)
            self.in_subparts = False
            self.current_problem = None

        elif tag == 'p' and cls in ('Number', 'Number0') and eid.startswith('exe'):
            self.buffer = []
            parts = eid.split('-')
            self.current_problem = {
                'id': eid,
                'number': parts[2] if len(parts) > 2 else '?',
                'is_starred': cls == 'Number0',
                'statement': '',
                'sub_parts': [],
            }
            if self.current_section is not None:
                self.current_section['problems'].append(self.current_problem)
            self.current_subpart = None
            self.in_subparts = False

        elif tag == 'div' and 'Left-a' in cls:
            self.in_subparts = True

        elif (tag == 'p' and cls == 'Alpha'
              and self.in_subparts
              and self.current_problem is not None):
            self.buffer = []
            self.current_subpart = {'label': '', 'text': ''}
            self.current_problem['sub_parts'].append(self.current_subpart)

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = False
            return
        if tag == 'div':
            self.in_subparts = False
            self.current_subpart = None
            return
        if tag not in FLUSH_TAGS:
            return

        text = self._flush()

        if tag == 'h2':
            if self.current_section and not self.current_section['title']:
                title = re.sub(r'^\d+\.\d+\s*', '', text).strip().lstrip('.')
                self.current_section['title'] = title

        elif tag == 'p':
            if self.current_subpart is not None:
                m = re.match(r'^\(([a-z])\)\s*(.*)', text, re.DOTALL)
                if m:
                    self.current_subpart['label'] = m.group(1)
                    self.current_subpart['text'] = m.group(2).strip()
                else:
                    self.current_subpart['text'] = text
                self.current_subpart = None
            elif self.current_problem is not None and not self.current_problem['statement']:
                self.current_problem['statement'] = re.sub(r'^\*?\d+\.\s*', '', text).strip()

    def handle_data(self, data):
        if not self.skip:
            self.buffer.append(data)


# ─────────────────────────────────────────────────────────────────────────────
# Reading content extractor
# ─────────────────────────────────────────────────────────────────────────────

def extract_section_html(full_html: str, section_id: str, next_section_id: str | None) -> str:
    """Return the HTML between two section headings."""
    start_pat = re.compile(rf'<h2[^>]*id="{re.escape(section_id)}"[^>]*>', re.IGNORECASE)
    m_start = start_pat.search(full_html)
    if not m_start:
        return ''

    if next_section_id:
        end_pat = re.compile(rf'<h2[^>]*id="{re.escape(next_section_id)}"[^>]*>', re.IGNORECASE)
        m_end = end_pat.search(full_html, m_start.end())
        end_pos = m_end.start() if m_end else len(full_html)
    else:
        # Last section — stop at <h2>Exercises</h2> if present, else end of file
        ex_pat = re.compile(r'<h2[^>]*>\s*<b>\s*Exercises\s*</b>\s*</h2>', re.IGNORECASE)
        m_ex = ex_pat.search(full_html, m_start.end())
        end_pos = m_ex.start() if m_ex else len(full_html)

    # Also stop at the Exercises heading within this section
    ex_pat2 = re.compile(r'<h2[^>]*>\s*<b>\s*Exercises\s*</b>\s*</h2>', re.IGNORECASE)
    m_ex2 = ex_pat2.search(full_html, m_start.end())
    if m_ex2 and m_ex2.start() < end_pos:
        end_pos = m_ex2.start()

    return full_html[m_start.end():end_pos]


class BlockExtractor(HTMLParser):
    """
    Extracts structured content blocks from a section's HTML.
    Produces a list of dicts: {kind, text, html, label, source_id, image_ref}
    """

    def __init__(self):
        super().__init__()
        self.blocks: list[dict] = []
        self.skip = False

        # State for current block being assembled
        self._kind: str | None = None
        self._label: str | None = None
        self._source_id: str | None = None
        self._image_ref: str | None = None
        self._html_buf: list[str] = []
        self._in_block = False

        # List context (numbered items inside examples)
        self._in_list = False
        self._list_item_buf: list[str] = []
        self._in_list_item = False

        # Figure context
        self._in_figure = False
        self._fig_image: str | None = None
        self._fig_caption_buf: list[str] = []
        self._in_caption = False

        self._depth = 0  # div nesting

    def _flush_block(self):
        if self._html_buf:
            html = clean_html(''.join(self._html_buf))
            text = strip_tags(html)
            if text or self._image_ref:
                self.blocks.append({
                    'kind':       self._kind or 'para',
                    'text':       text,
                    'html':       html,
                    'label':      self._label,
                    'source_id':  self._source_id,
                    'image_ref':  self._image_ref,
                })
        self._html_buf = []
        self._kind = None
        self._label = None
        self._source_id = None
        self._image_ref = None
        self._in_block = False

    def handle_starttag(self, tag, attrs):
        ad = dict(attrs)
        raw = f'<{tag}' + ''.join(f' {k}="{v}"' for k, v in attrs) + '>'

        if tag in ('script', 'style'):
            self.skip = True
            return

        cls = ad.get('class', '')
        eid = ad.get('id', '')

        if tag == 'div':
            self._depth += 1
            if cls in ('Figure', 'Image'):
                self._in_figure = True
                self._fig_image = None
                self._fig_caption_buf = []
            elif 'List' in cls:
                self._in_list = True
            return

        if tag == 'img':
            src = ad.get('src', '')
            if self._in_figure:
                self._fig_image = src
            elif cls in EQUATION_CLASSES or 'EquationAsImage' in cls:
                self.blocks.append({
                    'kind': 'equation',
                    'text': f'[equation: {src}]',
                    'html': raw,
                    'label': None,
                    'source_id': None,
                    'image_ref': src,
                })
            else:
                # Inline image inside a paragraph — append to current buffer
                self._html_buf.append(f'<img src="{src}" alt="{ad.get("alt","")}" />')
            return

        if tag == 'p':
            if cls in EXERCISE_CLASSES:
                return  # skip exercise items

            # Figure caption
            if self._in_figure and ('Caption' in cls or 'figlabel' in cls):
                self._in_caption = True
                return

            # List item inside example/definition
            if self._in_list and cls in LIST_ITEM_CLASSES:
                self._flush_block()
                self._kind = 'list_item'
                self._in_block = True
                self._html_buf.append(raw)
                return

            # Theorem / Example / Definition block
            if cls in THEOREM_CLASSES:
                self._flush_block()
                self._kind = 'example'  # covers examples, defs, theorems
                self._source_id = eid or None
                self._in_block = True
                self._html_buf.append(raw)
                return

            # Indented block (argument forms, quoted text)
            if cls in INDENTED_CLASSES:
                self._flush_block()
                self._kind = 'indented'
                self._in_block = True
                self._html_buf.append(raw)
                return

            # Regular paragraph
            if cls in READING_PARA_CLASSES or not cls:
                self._flush_block()
                self._kind = 'para'
                self._in_block = True
                self._html_buf.append(raw)
                return

        # Inline formatting — pass through into current buffer
        if self._in_block and tag in ('b', 'i', 'em', 'strong', 'span', 'a', 'sup', 'sub'):
            self._html_buf.append(raw)

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = False
            return

        if tag == 'div':
            self._depth -= 1
            if self._depth < 0:
                self._depth = 0
            if self._in_figure and self._depth == 0:
                # Flush figure block
                caption = strip_tags(''.join(self._fig_caption_buf))
                self.blocks.append({
                    'kind': 'figure',
                    'text': caption,
                    'html': f'<figure><img src="{self._fig_image or ""}" />'
                             + (f'<figcaption>{caption}</figcaption>' if caption else '')
                             + '</figure>',
                    'label': None,
                    'source_id': None,
                    'image_ref': self._fig_image,
                })
                self._in_figure = False
                self._fig_image = None
                self._fig_caption_buf = []
            if self._in_list and self._depth == 0:
                self._in_list = False
                self._flush_block()
            return

        if tag == 'p':
            if self._in_caption:
                self._in_caption = False
                return
            if self._in_block:
                self._html_buf.append(f'</{tag}>')
                self._flush_block()
            return

        if self._in_block and tag in ('b', 'i', 'em', 'strong', 'span', 'a', 'sup', 'sub'):
            self._html_buf.append(f'</{tag}>')

    def handle_data(self, data):
        if self.skip:
            return
        if self._in_caption:
            self._fig_caption_buf.append(data)
            return
        if self._in_block:
            self._html_buf.append(data)

    def handle_entityref(self, name):
        if self._in_block:
            self._html_buf.append(f'&{name};')

    def handle_charref(self, name):
        if self._in_block:
            self._html_buf.append(f'&#{name};')


def extract_blocks(section_html: str) -> list[dict]:
    extractor = BlockExtractor()
    extractor.feed(section_html)
    extractor._flush_block()  # flush any trailing block

    # Post-process: extract label from example blocks (e.g. "Example 1.1.1.")
    for block in extractor.blocks:
        if block['kind'] == 'example' and block['text']:
            m = re.match(r'^((?:Example|Definition|Theorem|Lemma|Corollary)\s+[\d.]+\.?)', block['text'])
            if m:
                block['label'] = m.group(1).rstrip('.')
                block['text'] = block['text'][m.end():].strip()

    return [b for b in extractor.blocks if b['text'] or b['image_ref']]


# ─────────────────────────────────────────────────────────────────────────────
# Top-level parse function
# ─────────────────────────────────────────────────────────────────────────────

def get_chapter_title(content: str) -> str:
    m = re.search(r'<h1 class="Chapter-Title">(.*?)</h1>', content, re.DOTALL)
    if not m:
        return ''
    return re.sub(r'<[^>]+>', '', m.group(1)).strip()


def parse_epub(epub_path: str, only_chapter: int | None = None) -> dict:
    book: dict = {'chapters': []}

    with zipfile.ZipFile(epub_path, 'r') as z:
        try:
            opf = z.read('OEBPS/content.opf').decode('utf-8')
            title_m   = re.search(r'<dc:title[^>]*>(.*?)</dc:title>', opf)
            creator_m = re.search(r'<dc:creator[^>]*>(.*?)</dc:creator>', opf)
            book['title']  = title_m.group(1)   if title_m   else 'Unknown'
            book['author'] = creator_m.group(1) if creator_m else ''
        except Exception:
            book['title']  = 'Unknown'
            book['author'] = ''

        for ch in range(1, 9):
            if only_chapter is not None and ch != only_chapter:
                continue

            fname = f'OEBPS/Chapter_{ch}.xhtml'
            try:
                content = z.read(fname).decode('utf-8')
            except KeyError:
                continue

            ch_title = get_chapter_title(content)

            # ── Parse problems ───────────────────────────────────────────
            prob_parser = SectionParser(ch)
            prob_parser.feed(content)
            sections_raw = prob_parser.sections

            # ── Extract reading blocks per section ───────────────────────
            section_ids = [s['id'] for s in sections_raw]
            sections_out = []

            for i, raw_sec in enumerate(sections_raw):
                next_id = section_ids[i + 1] if i + 1 < len(section_ids) else None
                sec_html = extract_section_html(content, raw_sec['id'], next_id)
                blocks = extract_blocks(sec_html)

                title = raw_sec['title'].lstrip('.')
                sections_out.append({
                    'id':       raw_sec['id'],
                    'number':   raw_sec['number'],
                    'title':    title,
                    'problems': raw_sec['problems'],
                    'blocks':   blocks,
                })

            book['chapters'].append({
                'number':   ch,
                'title':    ch_title,
                'sections': sections_out,
            })

    return book


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print('Usage: python3 parse_epub.py <epub_path> [--chapter N]', file=sys.stderr)
        sys.exit(1)

    epub_path = sys.argv[1]
    only_chapter = None
    if '--chapter' in sys.argv:
        idx = sys.argv.index('--chapter')
        only_chapter = int(sys.argv[idx + 1])

    book = parse_epub(epub_path, only_chapter)

    total_sections = sum(len(ch['sections']) for ch in book['chapters'])
    total_problems = sum(len(s['problems']) for ch in book['chapters'] for s in ch['sections'])
    total_blocks   = sum(len(s['blocks'])   for ch in book['chapters'] for s in ch['sections'])
    print(
        f"Parsed: {len(book['chapters'])} chapters, "
        f"{total_sections} sections, {total_problems} problems, "
        f"{total_blocks} content blocks",
        file=sys.stderr,
    )

    json.dump(book, sys.stdout, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
