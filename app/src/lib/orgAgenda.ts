/**
 * The agenda and the task list, from notes.
 *
 * Like org's org-agenda-files, only some notes count: NOTES_AGENDA, a comma
 * list of paths. All the notes are indexed, so this is not about speed. It
 * keeps the thousands of old TODOs in reading notes out of "what is due".
 */
import { addUnder, dayAgenda, deleteSubtree, openTasks, setTodo, type AgendaOptions, type DayEntry, type OpenTask } from 'notes/server'
import { todayString } from './orgDailies'

export const AGENDA_NOTES = (process.env.NOTES_AGENDA ?? 'schedule.org,tasks.org,anniversaries.org,inbox.org')
  .split(',').map((s) => s.trim()).filter(Boolean)
/** Where a task captured from a panel goes: under its "Tasks" heading. */
export const TASKS_NOTE = process.env.NOTES_TASKS ?? 'tasks.org'

export type AgendaEntry = DayEntry
export type Task = OpenTask

export const agendaFiles = () => AGENDA_NOTES
/**
 * The org settings this agenda follows, as they were in init.el: no backlog
 * of overdue scheduled items, done items hidden, and only a repeat's next date.
 */
export const AGENDA_OPTIONS: AgendaOptions = {
  scheduledPastDays: Number(process.env.NOTES_SCHEDULED_PAST_DAYS ?? 0),
  skipDone: true,
  futureRepeats: 'next',
}

export const agendaFor = (did: string, date: string) => dayAgenda(did, AGENDA_NOTES, date, todayString(), AGENDA_OPTIONS)
export const tasksList = (did: string) => openTasks(did, AGENDA_NOTES)
export const setAgendaTodo = (did: string, file: string, pos: number, state: string) => setTodo(did, file, pos, state)
export const addTask = (did: string, text: string) => addUnder(did, TASKS_NOTE, 'Tasks', { todo: 'TODO', title: text })
export const deleteTask = (did: string, file: string, pos: number, heading?: string) => deleteSubtree(did, file, pos, heading)
