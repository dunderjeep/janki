'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChatContext, ChatMessage } from '../lib/chat'
import { api, message } from './ui'

/**
 * Talk a draft through with Claude. Answer a review note and Claude revises
 * from what you said, and only that; a revision waits here until you apply it.
 */
export default function DocChat({ docId, prefill, previewing, onPreview, onApply }: {
  docId: string
  /** Text to start the next message with, from an Answer link in the review. */
  prefill: { text: string; n: number } | null
  previewing: string | null
  onPreview: (m: ChatMessage | null) => void
  onApply: (m: ChatMessage) => Promise<void>
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [context, setContext] = useState<ChatContext | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const box = useRef<HTMLTextAreaElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api<{ messages: ChatMessage[]; context: ChatContext }>(`/api/joblowski/documents/${docId}/chat`)
      .then((r) => { setMessages(r.messages); setContext(r.context) })
      .catch((err) => setError(message(err)))
  }, [docId])

  useEffect(() => {
    if (!prefill) return
    setText(prefill.text)
    box.current?.focus()
    box.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [prefill])

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight })
  }, [messages, sending])

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    setError(null)
    const mine = text.trim()
    try {
      const r = await api<{ messages: ChatMessage[] }>(`/api/joblowski/documents/${docId}/chat`, 'POST', { message: mine })
      setMessages(r.messages)
      setText('')
    } catch (err) {
      setError(message(err))
    } finally {
      setSending(false)
    }
  }

  const saveFact = async (fact: string) => {
    try {
      await api('/api/joblowski/facts', 'POST', { text: fact, documentId: docId })
      setSaved((s) => new Set(s).add(fact))
    } catch (err) {
      setError(message(err))
    }
  }

  const apply = async (m: ChatMessage) => {
    setError(null)
    try {
      await onApply(m)
      setMessages((all) => all.map((x) => (x.id === m.id ? { ...x, appliedAt: new Date().toISOString() } : x)))
    } catch (err) {
      setError(message(err))
    }
  }

  const link = 'text-sky-800 hover:underline'
  return (
    <section className="mb-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
      <p className="font-medium text-gray-900">Revise with Claude</p>
      <p className="text-xs text-gray-500">
        Answer the notes above or ask for changes{context?.company ? ` for ${context.role} at ${context.company}` : ''}.
        Claude uses only your original, your saved Facts and what you say here{context && !context.hasPosting ? '. This document has no job ad attached' : ''}.
      </p>

      {messages.length > 0 && (
        <div ref={list} className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1">
          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'ml-6 rounded-lg bg-sky-50 px-3 py-2' : 'mr-6 rounded-lg bg-gray-50 px-3 py-2'}>
              <p className="whitespace-pre-wrap break-words text-gray-900">{m.content}</p>
              {m.proposal && (
                <div className="mt-2 rounded border border-gray-200 bg-white px-2 py-1.5">
                  <p className="text-xs font-medium text-gray-700">
                    Revised draft
                    {m.proposal.notes.newNumbers.length + m.proposal.notes.termsFromAd.length > 0 && (
                      <span className="ml-2 text-amber-800">
                        {m.proposal.notes.newNumbers.length + m.proposal.notes.termsFromAd.length} to check:{' '}
                        {[...m.proposal.notes.newNumbers, ...m.proposal.notes.termsFromAd].join(', ')}
                      </span>
                    )}
                  </p>
                  {m.proposal.notes.changes.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-gray-600">
                      {m.proposal.notes.changes.slice(0, 5).map((c) => <li key={c} className="break-words">{c}</li>)}
                    </ul>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-3 text-xs">
                    {m.appliedAt ? (
                      <span className="text-green-700">Applied</span>
                    ) : (
                      <button className="rounded bg-sky-700 px-2.5 py-1 font-medium text-white hover:bg-sky-800" onClick={() => apply(m)}>Apply</button>
                    )}
                    <button className={link} onClick={() => onPreview(previewing === m.id ? null : m)}>
                      {previewing === m.id ? 'Back to yours' : 'Preview'}
                    </button>
                  </div>
                </div>
              )}
              {m.factsToRemember.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-600">Remember for other applications?</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {m.factsToRemember.map((f) => (
                      <li key={f} className="flex items-start justify-between gap-2 text-xs">
                        <span className="break-words text-gray-800">{f}</span>
                        {saved.has(f) ? (
                          <span className="shrink-0 text-green-700">Saved</span>
                        ) : (
                          <button className={`shrink-0 ${link}`} onClick={() => saveFact(f)}>Save to Facts</button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {sending && <p className="mr-6 rounded-lg bg-gray-50 px-3 py-2 text-gray-500">Claude is reading the draft… this takes about half a minute.</p>}
        </div>
      )}

      <form className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={send}>
        <textarea
          ref={box}
          rows={2}
          className="min-h-[3rem] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="e.g. I built Flask dashboards for two clients at Evenica. Or: make the profile shorter."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
          }}
        />
        <button
          className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50"
          disabled={sending || !text.trim()}
        >
          {sending ? 'Thinking…' : 'Send'}
        </button>
      </form>
      {sending && messages.length === 0 && <p className="mt-1 text-xs text-gray-500">Claude is reading the draft… this takes about half a minute.</p>}
      {error && <p className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-800">{error}</p>}
    </section>
  )
}
