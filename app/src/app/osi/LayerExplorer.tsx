'use client'

import { useState } from 'react'
import { OSI_LAYERS, type OSILayer } from '@/data/osi-model'

// Mnemonic: All People Should Do Not Sausage Pizza (top→bottom, L7→L1)
const MNEMONICS = [
  { direction: 'Sender (top → bottom)', phrase: '"All People Should Do Not Sausage Pizza"' },
  { direction: 'Receiver (bottom → top)', phrase: '"Please Do Not Throw Sausage Pizza Away"' },
]

function LayerBadge({ layer, compact = false, onClick, active }: {
  layer: OSILayer; compact?: boolean; onClick?: () => void; active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-stretch text-left w-full transition-all rounded-xl overflow-hidden
        ${active ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-[1.01]' : 'hover:scale-[1.005]'}
        ${compact ? 'h-9' : 'min-h-[56px]'}`}
      style={{ boxShadow: active ? `0 0 16px ${layer.color}66` : undefined }}>
      {/* Layer number */}
      <div className="flex-shrink-0 w-9 flex items-center justify-center text-xs font-black"
        style={{ backgroundColor: layer.color, color: layer.textColor }}>
        {layer.number}
      </div>
      {/* Name + PDU */}
      <div className="flex-1 px-3 py-1.5 flex flex-col justify-center"
        style={{ backgroundColor: layer.color + '22', borderRight: `2px solid ${layer.color}33` }}>
        <div className="text-xs font-bold" style={{ color: layer.color }}>{layer.name}</div>
        {!compact && (
          <div className="text-[9px] text-gray-400 font-mono mt-0.5">PDU: {layer.pdu}</div>
        )}
      </div>
      {/* Mnemonic word */}
      {!compact && (
        <div className="flex-shrink-0 flex items-center px-3">
          <span className="text-[9px] font-semibold text-gray-500 italic">{layer.mnemonic}</span>
        </div>
      )}
    </button>
  )
}

function ProtocolPill({ label, color }: { label: string; color: string }) {
  return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold"
      style={{ backgroundColor: color + '22', color }}>
      {label}
    </span>
  )
}

export function LayerExplorer() {
  const [selected, setSelected] = useState<OSILayer>(OSI_LAYERS[4]) // Network (L3) default

  return (
    <div className="flex h-full overflow-hidden bg-gray-950 text-gray-200">

      {/* ── Layer stack (left) ──────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-gray-800 overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest mb-1">
            OSI Reference Model
          </p>
          <p className="text-[9px] text-gray-600">Click a layer to explore</p>
        </div>

        {/* Layers (L7 → L1) */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1.5 pb-3">
          {/* Upper layers bracket */}
          <div className="relative">
            <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-blue-800 rounded" />
            <p className="text-[8px] text-blue-600 font-semibold pl-2 mb-1 uppercase tracking-widest">
              Upper Layers (host-to-host)
            </p>
            {OSI_LAYERS.slice(0, 3).map(l => (
              <div key={l.number} className="mb-1.5 pl-2">
                <LayerBadge layer={l} onClick={() => setSelected(l)} active={selected.number === l.number} />
              </div>
            ))}
          </div>

          {/* Transport */}
          <div className="relative">
            <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-yellow-700 rounded" />
            <p className="text-[8px] text-yellow-600 font-semibold pl-2 mb-1 uppercase tracking-widest">
              Transport (end-to-end)
            </p>
            <div className="pl-2">
              <LayerBadge layer={OSI_LAYERS[3]} onClick={() => setSelected(OSI_LAYERS[3])}
                active={selected.number === 4} />
            </div>
          </div>

          {/* Lower layers */}
          <div className="relative mt-1.5">
            <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-green-800 rounded" />
            <p className="text-[8px] text-green-600 font-semibold pl-2 mb-1 uppercase tracking-widest">
              Lower Layers (media)
            </p>
            {OSI_LAYERS.slice(4).map(l => (
              <div key={l.number} className="mb-1.5 pl-2">
                <LayerBadge layer={l} onClick={() => setSelected(l)} active={selected.number === l.number} />
              </div>
            ))}
          </div>
        </div>

        {/* Mnemonic */}
        <div className="border-t border-gray-800 px-3 py-3 flex-shrink-0 space-y-2">
          {MNEMONICS.map(m => (
            <div key={m.direction}>
              <p className="text-[8px] text-gray-600 uppercase tracking-wide">{m.direction}</p>
              <p className="text-[9px] text-gray-400 italic">{m.phrase}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Layer detail (right) ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Header strip */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${selected.color}33, ${selected.color}11)`,
                   border: `1px solid ${selected.color}44` }}>
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black"
                style={{ backgroundColor: selected.color, color: selected.textColor }}>
                {selected.number}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{selected.fullName}</h2>
                <p className="text-xs font-mono" style={{ color: selected.color }}>
                  PDU → <strong>{selected.pdu}</strong>
                  &nbsp;·&nbsp; Address: {selected.addresses}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{selected.description}</p>
          </div>
        </div>

        {/* Responsibility */}
        <div className="bg-gray-900 rounded-xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
            style={{ color: selected.color }}>Responsibility</p>
          <p className="text-sm text-gray-300">{selected.responsibility}</p>
        </div>

        {/* Protocols */}
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            Key Protocols
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selected.protocols.map(p => (
              <ProtocolPill key={p} label={p} color={selected.color} />
            ))}
          </div>
        </div>

        {/* Header / Trailer fields */}
        {(selected.headerFields || selected.trailerFields) && (
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
              {selected.pdu.split(' ')[0]} Header Fields
            </p>
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="bg-gray-900 text-gray-500">
                    <th className="text-left px-3 py-2">Field</th>
                    <th className="text-right px-3 py-2 w-16">Bits</th>
                    <th className="text-left px-3 py-2">Example</th>
                    <th className="text-left px-3 py-2">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected.headerFields ?? []).map(f => (
                    <tr key={f.name} className="border-t border-gray-800 hover:bg-gray-900/50">
                      <td className="px-3 py-2 font-semibold" style={{ color: selected.color }}>{f.name}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{f.bits}</td>
                      <td className="px-3 py-2 text-green-400">{f.value}</td>
                      <td className="px-3 py-2 text-gray-400">{f.desc}</td>
                    </tr>
                  ))}
                  {(selected.trailerFields ?? []).map(f => (
                    <tr key={f.name} className="border-t border-gray-800 bg-orange-950/20">
                      <td className="px-3 py-2 font-semibold text-orange-400">
                        {f.name} <span className="text-[9px] text-orange-600">(trailer)</span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">{f.bits}</td>
                      <td className="px-3 py-2 text-green-400">{f.value}</td>
                      <td className="px-3 py-2 text-gray-400">{f.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Devices */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900 rounded-xl p-3">
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Operates here</p>
            <div className="flex flex-wrap gap-1.5">
              {selected.devices.map(d => (
                <span key={d} className="px-2 py-0.5 rounded-md text-[10px] font-semibold
                  bg-gray-800 text-gray-300">{d}</span>
              ))}
            </div>
          </div>
          <div className="bg-gray-900 rounded-xl p-3">
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">Real-world analogy</p>
            <p className="text-xs text-gray-400 italic">{selected.realWorld}</p>
          </div>
        </div>

        {/* TCP/IP mapping note */}
        <div className="bg-gray-900 rounded-xl p-3">
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            TCP/IP model mapping
          </p>
          <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
            {selected.number >= 5 && (
              <span className="px-2 py-0.5 rounded" style={{ backgroundColor: '#ef444422', color: '#ef4444' }}>
                Application (TCP/IP)
              </span>
            )}
            {selected.number === 4 && (
              <span className="px-2 py-0.5 rounded" style={{ backgroundColor: '#eab30822', color: '#eab308' }}>
                Transport (TCP/IP)
              </span>
            )}
            {selected.number === 3 && (
              <span className="px-2 py-0.5 rounded" style={{ backgroundColor: '#22c55e22', color: '#22c55e' }}>
                Internet (TCP/IP)
              </span>
            )}
            {selected.number <= 2 && (
              <span className="px-2 py-0.5 rounded" style={{ backgroundColor: '#3b82f622', color: '#3b82f6' }}>
                Network Access / Link (TCP/IP)
              </span>
            )}
            <span className="text-gray-600">
              {selected.number >= 5
                ? 'Layers 5–7 collapse into one "Application" layer in the 4-layer TCP/IP model.'
                : selected.number === 4
                ? 'Maps 1:1 to TCP/IP Transport layer.'
                : selected.number === 3
                ? 'Maps 1:1 to TCP/IP Internet layer.'
                : 'Layers 1–2 collapse into TCP/IP "Link" layer.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
