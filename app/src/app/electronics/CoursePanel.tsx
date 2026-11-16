'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  COURSE_MODULES, LESSONS, getLessonsForModule, getLessonById,
  type Lesson,
} from '@/data/electronics-course'

const STORAGE_KEY = 'electronics-course-progress'

// ── Progress helpers ───────────────────────────────────────────────────────

function loadProgress(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch { return new Set() }
}

function saveProgress(done: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...done])) } catch { /* */ }
}

// ── Difficulty badge ───────────────────────────────────────────────────────

const DIFF_STYLE: Record<Lesson['difficulty'], string> = {
  beginner:     'bg-emerald-50 text-emerald-700',
  intermediate: 'bg-amber-50 text-amber-700',
  advanced:     'bg-red-50 text-red-700',
}

const MODULE_BORDER: Record<string, string> = {
  dc:    'border-amber-300',
  power: 'border-blue-300',
  ac:    'border-teal-400',
  semi:  'border-purple-300',
}

const MODULE_TEXT: Record<string, string> = {
  dc:    'text-amber-700',
  power: 'text-blue-700',
  ac:    'text-teal-700',
  semi:  'text-purple-700',
}

const MODULE_ACTIVE: Record<string, string> = {
  dc:    'bg-amber-50 ring-amber-300',
  power: 'bg-blue-50 ring-blue-300',
  ac:    'bg-teal-50 ring-teal-300',
  semi:  'bg-purple-50 ring-purple-300',
}

// ── CourseSidebar ──────────────────────────────────────────────────────────
// Shows module → lesson tree with progress. Rendered in the left panel.

interface CourseSidebarProps {
  activeLessonId: string | null
  onSelectLesson: (id: string) => void
}

export function CourseSidebar({ activeLessonId, onSelectLesson }: CourseSidebarProps) {
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set(['dc']))

  useEffect(() => { setCompleted(loadProgress()) }, [])

  // Auto-expand the module that contains the active lesson
  useEffect(() => {
    if (!activeLessonId) return
    const lesson = getLessonById(activeLessonId)
    if (lesson) setExpanded(prev => new Set([...prev, lesson.moduleId]))
  }, [activeLessonId])

  const totalLessons    = LESSONS.length
  const completedCount  = LESSONS.filter(l => completed.has(l.id)).length
  const pct             = Math.round((completedCount / totalLessons) * 100)

  const toggleModule = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Overall progress bar */}
      <div className="px-3 py-3 border-b border-gray-100 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-gray-500 font-medium">
          <span>Course Progress</span>
          <span className="font-semibold text-indigo-600">{completedCount}/{totalLessons}</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-[9px] text-gray-400">{pct}% complete</div>
      </div>

      {/* Module + lesson tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {COURSE_MODULES.map(mod => {
          const lessons     = getLessonsForModule(mod.id)
          const doneCount   = lessons.filter(l => completed.has(l.id)).length
          const isExpanded  = expanded.has(mod.id)
          const allDone     = doneCount === lessons.length

          return (
            <div key={mod.id}>
              {/* Module header */}
              <button
                onClick={() => toggleModule(mod.id)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
              >
                <span className="text-base">{mod.icon}</span>
                <div className="flex-1 text-left">
                  <div className={`text-[11px] font-bold ${MODULE_TEXT[mod.id]}`}>{mod.title}</div>
                  <div className="text-[9px] text-gray-400">{doneCount}/{lessons.length} done</div>
                </div>
                {allDone && <span className="text-emerald-500 text-[10px]">✓</span>}
                <span className="text-gray-400 text-[10px]">{isExpanded ? '▾' : '▸'}</span>
              </button>

              {/* Lessons */}
              {isExpanded && (
                <div className="pb-1">
                  {lessons.map((lesson, idx) => {
                    const isDone   = completed.has(lesson.id)
                    const isActive = activeLessonId === lesson.id
                    return (
                      <button
                        key={lesson.id}
                        onClick={() => onSelectLesson(lesson.id)}
                        className={`w-full flex items-start gap-2 pl-7 pr-3 py-1.5 text-left
                          transition-all group
                          ${isActive
                            ? `ring-1 ring-inset ${MODULE_ACTIVE[lesson.moduleId]} ${MODULE_BORDER[lesson.moduleId]}`
                            : 'hover:bg-gray-50'}`}
                      >
                        {/* Step number / check */}
                        <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center
                          flex-shrink-0 text-[9px] font-bold border
                          ${isDone
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : isActive
                              ? `${MODULE_BORDER[lesson.moduleId]} border bg-white ${MODULE_TEXT[lesson.moduleId]}`
                              : 'border-gray-200 bg-white text-gray-400'}`}>
                          {isDone ? '✓' : idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-[11px] font-semibold truncate
                            ${isActive ? MODULE_TEXT[lesson.moduleId] : isDone ? 'text-gray-500' : 'text-gray-700'}`}>
                            {lesson.icon} {lesson.title}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[9px] px-1 rounded ${DIFF_STYLE[lesson.difficulty]}`}>
                              {lesson.difficulty}
                            </span>
                            <span className="text-[9px] text-gray-400">{lesson.duration}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Reset progress button */}
      {completedCount > 0 && (
        <div className="border-t border-gray-100 px-3 py-2">
          <button
            onClick={() => {
              const fresh = new Set<string>()
              setCompleted(fresh)
              saveProgress(fresh)
            }}
            className="w-full text-[10px] text-gray-400 hover:text-red-500 transition-colors py-1"
          >
            Reset progress
          </button>
        </div>
      )}
    </div>
  )
}

// ── LessonGuide ────────────────────────────────────────────────────────────
// Shows the active lesson steps, theory, and completion controls.
// Rendered at the top of the right instruments panel.

interface LessonGuideProps {
  lessonId:       string | null
  onClose:        () => void
  onLoadPreset:   (name: string) => void
  onLessonComplete: (id: string) => void
}

function renderStepText(text: string) {
  // Bold **text** → <strong>
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="text-gray-900">{part}</strong> : part
  )
}

export function LessonGuide({ lessonId, onClose, onLoadPreset, onLessonComplete }: LessonGuideProps) {
  const [completed,      setCompleted]      = useState<Set<string>>(new Set())
  const [stepsDone,      setStepsDone]      = useState<Set<number>>(new Set())
  const [showTheory,     setShowTheory]     = useState(false)
  const [expandedSteps,  setExpandedSteps]  = useState<Set<number>>(new Set())

  useEffect(() => { setCompleted(loadProgress()) }, [])

  // Reset step progress when lesson changes
  useEffect(() => {
    setStepsDone(new Set())
    setShowTheory(false)
    setExpandedSteps(new Set())
  }, [lessonId])

  const lesson = lessonId ? getLessonById(lessonId) : null
  if (!lesson) return null

  const isDone        = completed.has(lesson.id)
  const allStepsDone  = stepsDone.size >= lesson.steps.length

  function toggleStep(idx: number) {
    setStepsDone(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function toggleDetail(idx: number) {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function markComplete() {
    if (!lesson) return
    const next = new Set(completed)
    next.add(lesson.id)
    setCompleted(next)
    saveProgress(next)
    onLessonComplete(lesson.id)
  }

  function markIncomplete() {
    if (!lesson) return
    const next = new Set(completed)
    next.delete(lesson.id)
    setCompleted(next)
    saveProgress(next)
  }

  const modColor  = lesson ? (MODULE_TEXT[lesson.moduleId]   ?? 'text-indigo-700')   : 'text-indigo-700'
  const modBorder = lesson ? (MODULE_BORDER[lesson.moduleId] ?? 'border-indigo-300') : 'border-indigo-300'

  return (
    <div className={`border-l-2 ${modBorder} bg-white rounded-xl shadow-sm overflow-hidden`}>

      {/* Header */}
      <div className="px-3 py-2.5 flex items-start gap-2 border-b border-gray-100">
        <span className="text-base leading-none mt-0.5">{lesson.icon}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-bold ${modColor} leading-tight`}>{lesson.title}</div>
          <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{lesson.concept}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${DIFF_STYLE[lesson.difficulty]}`}>
            {lesson.difficulty}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs px-1">✕</button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-280px)] overflow-y-auto">

        {/* Preset loader */}
        {lesson.presetName && (
          <div className="px-3 pt-2.5 pb-0">
            <button
              onClick={() => onLoadPreset(lesson.presetName!)}
              className={`w-full py-1.5 text-[10px] font-semibold rounded-lg border ${modBorder}
                ${modColor} hover:bg-gray-50 transition-colors flex items-center justify-center gap-1`}
            >
              ⚡ Load "{lesson.presetName}" preset
            </button>
          </div>
        )}

        {/* Theory (collapsible) */}
        <div className="px-3 pt-2.5">
          <button
            onClick={() => setShowTheory(v => !v)}
            className="w-full flex items-center justify-between text-[10px] font-semibold text-gray-500
              hover:text-gray-700 transition-colors py-1 border-b border-gray-100"
          >
            <span>📖 Theory</span>
            <span>{showTheory ? '▾' : '▸'}</span>
          </button>
          {showTheory && (
            <p className="text-[11px] text-gray-600 leading-relaxed py-2">{lesson.theory}</p>
          )}
        </div>

        {/* Steps */}
        <div className="px-3 pt-2 pb-1">
          <div className="text-[10px] font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
            <span>Steps</span>
            <span className="text-gray-400">({stepsDone.size}/{lesson.steps.length})</span>
          </div>
          <div className="space-y-1">
            {lesson.steps.map((step, idx) => {
              const done      = stepsDone.has(idx)
              const hasDetail = !!step.detail
              const showDetail = expandedSteps.has(idx)
              return (
                <div key={idx}
                  className={`rounded-lg border transition-colors
                    ${done ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-100 bg-gray-50/50'}`}
                >
                  <div className="flex items-start gap-2 px-2 py-1.5">
                    <button
                      onClick={() => toggleStep(idx)}
                      className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center
                        text-[9px] font-bold transition-colors
                        ${done
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-gray-300 bg-white hover:border-emerald-400'}`}
                    >
                      {done ? '✓' : idx + 1}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[11px] leading-snug ${done ? 'text-gray-500' : 'text-gray-700'}`}>
                        {renderStepText(step.text)}
                      </p>
                      {hasDetail && (
                        <>
                          <button
                            onClick={() => toggleDetail(idx)}
                            className="text-[9px] text-indigo-500 hover:text-indigo-700 mt-0.5"
                          >
                            {showDetail ? '▾ less' : '▸ hint'}
                          </button>
                          {showDetail && (
                            <p className="text-[10px] text-indigo-600 mt-1 leading-snug italic">
                              {step.detail}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Success criteria */}
        <div className="px-3 py-2 mx-3 my-2 bg-emerald-50 rounded-lg">
          <div className="text-[9px] font-bold text-emerald-700 uppercase tracking-wide mb-0.5">Expected result</div>
          <p className="text-[10px] text-emerald-800 leading-snug">{lesson.successCriteria}</p>
        </div>

        {/* Challenge */}
        {lesson.challenge && (
          <div className="px-3 py-2 mx-3 mb-2 bg-indigo-50 rounded-lg">
            <div className="text-[9px] font-bold text-indigo-600 uppercase tracking-wide mb-0.5">🎯 Bonus challenge</div>
            <p className="text-[10px] text-indigo-800 leading-snug">{lesson.challenge}</p>
          </div>
        )}

        {/* Mark complete / undo */}
        <div className="px-3 pb-3">
          {isDone ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 py-1.5 text-xs font-semibold text-center rounded-lg
                bg-emerald-100 text-emerald-700">
                ✓ Completed
              </div>
              <button
                onClick={markIncomplete}
                className="px-2 py-1.5 text-[10px] text-gray-400 hover:text-gray-600
                  rounded-lg border border-gray-200 transition-colors"
              >
                Undo
              </button>
            </div>
          ) : (
            <button
              onClick={markComplete}
              className={`w-full py-1.5 text-xs font-semibold rounded-lg transition-colors
                ${allStepsDone
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {allStepsDone ? '✓ Mark complete' : `Mark complete (${stepsDone.size}/${lesson.steps.length} steps)`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── LessonStepBar ──────────────────────────────────────────────────────────
// Compact inline guide strip rendered above the breadboard.
// Shows the active step sequentially so the user can follow along without
// switching to the Course tab.

interface LessonStepBarProps {
  lessonId:     string | null
  onClose:      () => void
  onLoadPreset: (name: string) => void
}

export function LessonStepBar({ lessonId, onClose, onLoadPreset }: LessonStepBarProps) {
  const [stepIdx,   setStepIdx]   = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [showHint,  setShowHint]  = useState(false)
  const [completed, setCompleted] = useState<Set<string>>(new Set())

  useEffect(() => { setCompleted(loadProgress()) }, [])
  useEffect(() => { setStepIdx(0); setCollapsed(false); setShowHint(false) }, [lessonId])

  const lesson = lessonId ? getLessonById(lessonId) : null
  if (!lesson) return null

  const total   = lesson.steps.length
  const step    = lesson.steps[stepIdx]
  const isDone  = completed.has(lesson.id)

  function markComplete() {
    const next = new Set(completed)
    next.add(lesson!.id)
    setCompleted(next)
    saveProgress(next)
  }

  const modColor  = MODULE_TEXT[lesson.moduleId]   ?? 'text-indigo-700'
  const modBg     = lesson.moduleId === 'dc'    ? 'bg-amber-50  border-amber-200'
                  : lesson.moduleId === 'power' ? 'bg-blue-50   border-blue-200'
                  : lesson.moduleId === 'ac'    ? 'bg-teal-50   border-teal-200'
                  :                               'bg-purple-50  border-purple-200'

  return (
    <div className={`border-b ${modBg} select-none`}>
      {/* Header row — always visible */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-sm">{lesson.icon}</span>
        <span className={`text-[11px] font-bold ${modColor} flex-1 truncate`}>{lesson.title}</span>

        {/* Step progress dots */}
        <div className="flex items-center gap-0.5">
          {lesson.steps.map((_, i) => (
            <button
              key={i}
              onClick={() => { setStepIdx(i); setCollapsed(false); setShowHint(false) }}
              className={`w-2 h-2 rounded-full transition-colors ${
                i < stepIdx  ? 'bg-emerald-400'
                : i === stepIdx ? `${modColor.replace('text-', 'bg-').replace('-700', '-500')} ring-1 ring-offset-1 ring-current`
                : 'bg-gray-200'}`}
            />
          ))}
        </div>

        <span className="text-[10px] text-gray-400 font-mono w-9 text-right flex-shrink-0">
          {stepIdx + 1}/{total}
        </span>

        {/* Preset loader */}
        {lesson.presetName && stepIdx === 0 && (
          <button
            onClick={() => onLoadPreset(lesson.presetName!)}
            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${modColor}
              ${modBg} hover:opacity-80 transition-opacity flex-shrink-0`}
          >
            Load preset
          </button>
        )}

        {isDone && (
          <span className="text-emerald-600 text-[10px] font-bold flex-shrink-0">✓ Done</span>
        )}

        <button
          onClick={() => setCollapsed(v => !v)}
          className="text-gray-400 hover:text-gray-600 text-xs px-0.5 flex-shrink-0"
        >
          {collapsed ? '▾' : '▴'}
        </button>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0">✕</button>
      </div>

      {/* Step body — collapsible */}
      {!collapsed && (
        <div className="px-3 pb-2 space-y-1.5">
          {/* Step text */}
          <p className="text-[12px] text-gray-800 leading-snug">
            {renderStepText(step.text)}
          </p>

          {/* Hint */}
          {step.detail && (
            <div>
              {!showHint ? (
                <button
                  onClick={() => setShowHint(true)}
                  className="text-[10px] text-indigo-500 hover:text-indigo-700"
                >
                  💡 Show hint
                </button>
              ) : (
                <p className="text-[10px] text-indigo-700 italic leading-snug bg-white/60 rounded px-2 py-1">
                  {step.detail}
                </p>
              )}
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex items-center gap-2 pt-0.5">
            <button
              disabled={stepIdx === 0}
              onClick={() => { setStepIdx(i => i - 1); setShowHint(false) }}
              className="px-2 py-1 text-[10px] font-semibold rounded border border-gray-200
                bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              ← Back
            </button>

            {stepIdx < total - 1 ? (
              <button
                onClick={() => { setStepIdx(i => i + 1); setShowHint(false) }}
                className={`flex-1 py-1 text-[10px] font-semibold rounded border
                  ${modBg} ${modColor} hover:opacity-80 transition-opacity`}
              >
                Next step →
              </button>
            ) : (
              <button
                onClick={markComplete}
                disabled={isDone}
                className={`flex-1 py-1 text-[10px] font-semibold rounded transition-colors
                  ${isDone
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600'}`}
              >
                {isDone ? '✓ Completed!' : '✓ Mark complete'}
              </button>
            )}

            {/* Bonus challenge pill on last step */}
            {stepIdx === total - 1 && lesson.challenge && (
              <span className="text-[9px] text-indigo-500 border border-indigo-200 rounded px-1.5 py-0.5 flex-shrink-0">
                🎯 Challenge →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Navigation helper (prev / next lesson) ────────────────────────────────

export function useCourseNav(activeLessonId: string | null) {
  const idx  = activeLessonId ? LESSONS.findIndex(l => l.id === activeLessonId) : -1
  const prev = idx > 0 ? LESSONS[idx - 1] : null
  const next = idx >= 0 && idx < LESSONS.length - 1 ? LESSONS[idx + 1] : null
  return { prev, next }
}
