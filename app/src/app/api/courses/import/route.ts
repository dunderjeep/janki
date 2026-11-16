/**
 * POST /api/courses/import
 *
 * Runs the Python epub parser on a local file path, then seeds the DB with
 * the resulting book / chapter / section / problem hierarchy.
 *
 * Body: { epubPath: string, edition?: string }
 *
 * For each chapter an srs_deck is auto-created so problems can generate cards
 * into it. Re-importing the same epub (same title + owner) is idempotent at
 * the book level — it will return the existing bookId and skip re-insertion.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import {
  courseBooks, courseChapters, courseSections, courseProblems,
  courseSectionBlocks, srsDecks,
} from '@/db/schema/janki'
import { and, eq } from 'drizzle-orm'
import { execSync } from 'child_process'
import path from 'path'
import { nanoid } from 'nanoid'

type SubPart = { label: string; text: string }
type RawProblem = {
  id: string; number: string; is_starred: boolean
  statement: string; sub_parts: SubPart[]
}
type RawBlock = {
  kind: string; text: string; html: string
  label?: string; source_id?: string; image_ref?: string
}
type RawSection = {
  id: string; number: string; title: string
  problems: RawProblem[]; blocks: RawBlock[]
}
type RawChapter = { number: number; title: string; sections: RawSection[] }
type ParsedBook  = { title: string; author: string; chapters: RawChapter[] }

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uid = session.user.id

  const body = await req.json() as { epubPath: string; edition?: string }
  const { epubPath, edition = '' } = body

  if (!epubPath) return NextResponse.json({ error: 'epubPath required' }, { status: 400 })

  // ── 1. Parse epub ─────────────────────────────────────────────────────────
  // Resolve relative paths against the project root (one level above /app)
  const projectRoot = path.resolve(process.cwd(), '..')
  const scriptPath  = path.join(projectRoot, 'scripts', 'parse_epub.py')
  const resolvedEpub = path.isAbsolute(epubPath)
    ? epubPath
    : path.resolve(projectRoot, epubPath)

  let parsed: ParsedBook
  try {
    const stdout = execSync(`python3 "${scriptPath}" "${resolvedEpub}"`, {
      maxBuffer: 20 * 1024 * 1024,
    }).toString()
    parsed = JSON.parse(stdout) as ParsedBook
  } catch (e: any) {
    return NextResponse.json(
      { error: `Parser failed: ${e.message ?? String(e)}` },
      { status: 422 },
    )
  }

  // ── 2. Upsert book (idempotent on title + owner) ──────────────────────────
  const [existing] = await db
    .select({ id: courseBooks.id })
    .from(courseBooks)
    .where(and(eq(courseBooks.ownerUid, uid), eq(courseBooks.title, parsed.title)))
    .limit(1)

  const bookId = existing?.id ?? nanoid()

  if (!existing) {
    await db.insert(courseBooks).values({
      id:       bookId,
      ownerUid: uid,
      title:    parsed.title,
      author:   parsed.author,
      edition,
      epubPath: resolvedEpub,
    })
  }

  // ── 3. Insert chapters, sections, problems ────────────────────────────────
  let chapterCount = 0, sectionCount = 0, problemCount = 0, blockCount = 0

  for (const rawCh of parsed.chapters) {
    // Skip if chapter already exists for this book
    const [existingCh] = await db
      .select({ id: courseChapters.id })
      .from(courseChapters)
      .where(and(eq(courseChapters.bookId, bookId), eq(courseChapters.number, rawCh.number)))
      .limit(1)

    if (existingCh) continue

    // Create a deck for this chapter
    const deckId = nanoid()
    await db.insert(srsDecks).values({
      id:          deckId,
      ownerUid:    uid,
      name:        `${parsed.title} — Ch. ${rawCh.number}: ${rawCh.title}`,
      description: `Auto-created for Chapter ${rawCh.number} problems.`,
      active:      false,  // off by default until you start working the chapter
    })

    const chapterId = nanoid()
    await db.insert(courseChapters).values({
      id:        chapterId,
      bookId,
      number:    rawCh.number,
      title:     rawCh.title,
      sortOrder: rawCh.number,
      deckId,
    })
    chapterCount++

    for (let si = 0; si < rawCh.sections.length; si++) {
      const rawSec = rawCh.sections[si]
      const sectionId = nanoid()
      await db.insert(courseSections).values({
        id:        sectionId,
        chapterId,
        number:    rawSec.number,
        title:     rawSec.title,
        sortOrder: si,
      })
      sectionCount++

      for (const rawP of rawSec.problems) {
        await db.insert(courseProblems).values({
          id:        nanoid(),
          sectionId,
          sourceId:  rawP.id,
          number:    rawP.number,
          isStarred: rawP.is_starred,
          statement: rawP.statement,
          subParts:  rawP.sub_parts,
        })
        problemCount++
      }

      // Seed reading content blocks
      for (let bi = 0; bi < rawSec.blocks.length; bi++) {
        const b = rawSec.blocks[bi]
        await db.insert(courseSectionBlocks).values({
          id:          nanoid(),
          sectionId,
          sortOrder:   bi,
          kind:        b.kind as any,
          textContent: b.text,
          html:        b.html,
          label:       b.label ?? null,
          sourceId:    b.source_id ?? null,
          imageRef:    b.image_ref ?? null,
        })
        blockCount++
      }
    }
  }

  return NextResponse.json({
    bookId,
    imported: { chapters: chapterCount, sections: sectionCount, problems: problemCount, blocks: blockCount },
    skipped:  existing ? 'book already existed; only new chapters imported' : undefined,
  })
}
