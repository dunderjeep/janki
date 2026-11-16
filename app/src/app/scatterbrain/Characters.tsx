'use client'

import { useState } from 'react'
import { imageSrc } from '@/lib/porcupin/types'
import type { CharacterView, WorkBundle } from '@/lib/scatterbrain/types'
import { api, jsonBody } from '../porcupin/intake'
import Field from './Field'
import { AttachmentList, ImageDrop } from './Images'
import type { Actions } from './Workspace'

export default function Characters({ bundle, actions, onOpenItem }: { bundle: WorkBundle; actions: Actions; onOpenItem: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(bundle.characters[0]?.id ?? null)
  const [name, setName] = useState('')
  const selected = bundle.characters.find((c) => c.id === selectedId) ?? null

  const portrait = (id: string) => bundle.attachments.find((a) => a.characterId === id)?.pinId

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const made = await api<CharacterView>(`/api/scatterbrain/works/${bundle.work.id}/characters`, jsonBody('POST', { name }))
      setName('')
      await actions.refresh()
      setSelectedId(made.id)
    } catch (err) {
      actions.note((err as Error).message)
    }
  }

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        <form onSubmit={add} className="flex max-w-sm gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New character's name" aria-label="New character's name" className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
          <button disabled={!name.trim()} className="rounded-md bg-purple-700 px-3 py-1.5 text-sm text-white hover:bg-purple-800 disabled:opacity-40">Add</button>
        </form>
        {bundle.characters.length === 0 && <p className="mt-10 text-center text-sm text-gray-500">No characters yet. Name the first one above.</p>}
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {bundle.characters.map((c) => {
            const pin = portrait(c.id)
            return (
              <li key={c.id}>
                <button onClick={() => setSelectedId(c.id)} aria-pressed={selectedId === c.id} className={`block w-full overflow-hidden rounded-xl border text-left shadow-sm hover:shadow ${selectedId === c.id ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-200'}`}>
                  {pin
                    ? <img src={imageSrc(pin, 'thumb')} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                    : <span aria-hidden className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-purple-100 to-fuchsia-200 text-5xl font-semibold text-purple-800">{c.name[0]}</span>}
                  <span className="block px-2 pt-1.5 text-sm font-medium text-gray-900">{c.name}</span>
                  <span className="block truncate px-2 pb-2 text-xs text-gray-500">{c.role || ' '}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      {selected && <Detail key={selected.id} character={selected} bundle={bundle} actions={actions} onOpenItem={onOpenItem} onDeleted={() => setSelectedId(null)} />}
    </div>
  )
}

function Detail({ character, bundle, actions, onOpenItem, onDeleted }: {
  character: CharacterView
  bundle: WorkBundle
  actions: Actions
  onOpenItem: (id: string) => void
  onDeleted: () => void
}) {
  const url = `/api/scatterbrain/characters/${character.id}`
  const save = (patch: object) => api(url, jsonBody('PATCH', patch)).then(() => actions.refresh()).catch((e: Error) => actions.note(e.message))
  const appearances = bundle.items.filter((i) => i.characterIds.includes(character.id) || i.povCharacterId === character.id)

  const remove = async () => {
    if (!confirm(`Delete ${character.name}? Their images stay in Porcupin.`)) return
    try {
      await api(url, { method: 'DELETE' })
      onDeleted()
      await actions.refresh()
    } catch (e) {
      actions.note((e as Error).message)
    }
  }

  const makePortrait = async (id: string) => {
    await api(`/api/scatterbrain/attachments/${id}`, jsonBody('PATCH', { first: true }))
    await actions.refresh()
  }

  return (
    <aside aria-label={character.name} className="w-96 shrink-0 space-y-3 overflow-y-auto border-l border-gray-200 bg-gray-50 p-4">
      <Field label="Name" value={character.name} onSave={(name) => name.trim() && void save({ name })} />
      <Field label="Role" value={character.role} placeholder="Protagonist, the neighbour, the dog" onSave={(role) => void save({ role })} />
      <Field label="About them" value={character.description} multiline rows={8} onSave={(description) => void save({ description })} />

      <div>
        <div className="mb-1 text-xs font-medium text-gray-600">Images</div>
        <ImageDrop target={{ workId: bundle.work.id, characterId: character.id }} actions={actions} />
        <AttachmentList
          attachments={bundle.attachments.filter((a) => a.characterId === character.id)}
          actions={actions}
          extra={(a, index) => index === 0
            ? <span className="font-medium text-purple-800">Portrait</span>
            : <button onClick={() => void makePortrait(a.id)} className="text-purple-700 hover:underline">Use as portrait</button>}
        />
      </div>

      <div>
        <div className="text-xs font-medium text-gray-600">Appears in</div>
        {appearances.length === 0 && <p className="mt-1 text-xs text-gray-500">No scenes yet. Add them from a scene&apos;s Cast tab.</p>}
        <ul className="mt-1 space-y-0.5">
          {appearances.map((item) => (
            <li key={item.id}>
              <button onClick={() => onOpenItem(item.id)} className="text-sm text-purple-700 hover:underline">{item.title}</button>
              {item.povCharacterId === character.id && <span className="ml-1 text-xs text-gray-500">(POV)</span>}
            </li>
          ))}
        </ul>
      </div>

      <button onClick={() => void remove()} className="text-xs text-gray-500 hover:text-red-700">Delete this character</button>
    </aside>
  )
}
