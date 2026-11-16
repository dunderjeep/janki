'use client'

import { useState } from 'react'
import { NETWORK_DEVICES, OSI_LAYERS, type NetworkDevice } from '@/data/osi-model'

// ── OSI layer pill ────────────────────────────────────────────────────────────

function LayerPill({ num, active }: { num: number; active: boolean }) {
  const layer = OSI_LAYERS.find(l => l.number === num)!
  return (
    <div className={`px-2 py-1 rounded-lg text-center transition-all ${
      active ? 'opacity-100' : 'opacity-20'}`}
      style={{ backgroundColor: active ? layer.color + '33' : undefined,
               border: `1px solid ${active ? layer.color + '66' : '#374151'}` }}>
      <div className="text-[8px] font-bold" style={{ color: active ? layer.color : '#4b5563' }}>
        L{num}
      </div>
      <div className="text-[7px] text-gray-500">{layer.name}</div>
    </div>
  )
}

// ── Device card ───────────────────────────────────────────────────────────────

function DeviceCard({ device, isSelected, onClick }: {
  device:     NetworkDevice
  isSelected: boolean
  onClick:    () => void
}) {
  const topLayer = Math.max(...device.layers)
  const color    = OSI_LAYERS.find(l => l.number === topLayer)?.color ?? '#6b7280'

  return (
    <button onClick={onClick}
      className={`w-full text-left rounded-2xl border transition-all p-4 ${
        isSelected
          ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-950'
          : 'hover:border-gray-600'}`}
      style={{
        backgroundColor: isSelected ? color + '22' : '#111827',
        borderColor:     isSelected ? color : '#374151',
        boxShadow:       isSelected ? `0 0 16px ${color}44` : undefined,
      }}>

      {/* Icon + name */}
      <div className="flex items-center gap-3 mb-3">
        <div className="text-2xl">{device.icon}</div>
        <div>
          <div className="font-bold text-white text-sm">{device.name}</div>
          <div className="text-[9px] font-mono" style={{ color }}>
            Forwards on: {device.forwardsOn}
          </div>
        </div>
      </div>

      {/* Layer stack — 7 down to 1 */}
      <div className="flex gap-1 justify-center">
        {[7, 6, 5, 4, 3, 2, 1].map(n => (
          <LayerPill key={n} num={n} active={device.layers.includes(n)} />
        ))}
      </div>
    </button>
  )
}

// ── Forwarding table visual ───────────────────────────────────────────────────

function MacTable() {
  const rows = [
    { mac: 'AA:BB:CC:11:22:33', port: '1', vlan: '10', age: '284s', note: 'PC-A' },
    { mac: 'AA:BB:CC:44:55:66', port: '2', vlan: '10', age: '12s',  note: 'PC-B' },
    { mac: 'AA:BB:CC:77:88:99', port: '3', vlan: '20', age: '55s',  note: 'PC-C' },
    { mac: 'DD:EE:FF:00:11:22', port: '4', vlan: '20', age: '1s',   note: 'just learned!' },
  ]
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="bg-gray-900 text-gray-500">
            <th className="text-left px-3 py-2">MAC Address</th>
            <th className="text-left px-2 py-2">Port</th>
            <th className="text-left px-2 py-2">VLAN</th>
            <th className="text-left px-2 py-2">Age</th>
            <th className="text-left px-3 py-2">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.mac} className="border-t border-gray-800 hover:bg-gray-900/50">
              <td className="px-3 py-1.5 text-blue-400">{r.mac}</td>
              <td className="px-2 py-1.5 text-white">{r.port}</td>
              <td className="px-2 py-1.5 text-yellow-400">{r.vlan}</td>
              <td className="px-2 py-1.5 text-gray-500">{r.age}</td>
              <td className="px-3 py-1.5 text-gray-400 italic">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RoutingTable() {
  const rows = [
    { prefix: '10.0.0.0/24',     next: 'directly connected', iface: 'Gi0/0', proto: 'C', metric: '0' },
    { prefix: '192.168.1.0/24',  next: 'directly connected', iface: 'Gi0/1', proto: 'C', metric: '0' },
    { prefix: '172.16.0.0/16',   next: '10.0.0.254',         iface: 'Gi0/0', proto: 'O', metric: '110' },
    { prefix: '0.0.0.0/0',       next: '203.0.113.1',        iface: 'Gi0/2', proto: 'S', metric: '1' },
  ]
  const protoColor: Record<string, string> = { C:'#22c55e', O:'#3b82f6', S:'#f97316' }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-[10px] font-mono">
        <thead>
          <tr className="bg-gray-900 text-gray-500">
            <th className="text-left px-1.5 py-2">P</th>
            <th className="text-left px-3 py-2">Prefix</th>
            <th className="text-left px-3 py-2">Next-Hop</th>
            <th className="text-left px-2 py-2">Interface</th>
            <th className="text-left px-2 py-2">Metric</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.prefix} className="border-t border-gray-800">
              <td className="px-1.5 py-1.5 font-bold"
                style={{ color: protoColor[r.proto] ?? '#fff' }}>{r.proto}</td>
              <td className="px-3 py-1.5 text-green-400">{r.prefix}</td>
              <td className="px-3 py-1.5 text-gray-300">{r.next}</td>
              <td className="px-2 py-1.5 text-yellow-400">{r.iface}</td>
              <td className="px-2 py-1.5 text-gray-500">{r.metric}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[9px] text-gray-600 border-t border-gray-800">
        C = Connected · O = OSPF · S = Static · &nbsp;
        Default route 0.0.0.0/0 = "send everything unknown to the ISP"
      </div>
    </div>
  )
}

// ── Packet journey diagram ────────────────────────────────────────────────────

function PacketJourney({ device }: { device: NetworkDevice }) {
  // Show what happens at each layer when a frame arrives
  const steps: { layer: number; action: string; note?: string }[] = []

  if (device.layers.includes(1)) {
    steps.push({
      layer: 1,
      action: 'Receives bits from the wire / radio / fibre',
      note: device.id === 'hub'
        ? 'Regenerates signal and immediately floods ALL other ports — no decisions made.'
        : 'Decodes bit stream into a frame, passes it up to L2.',
    })
  }
  if (device.layers.includes(2)) {
    steps.push({
      layer: 2,
      action: 'Reads Ethernet frame header — checks Destination MAC',
      note: device.id === 'switch'
        ? 'If Dest MAC is in the MAC table → forward only to that port. If not → flood. Records Source MAC.'
        : 'Validates FCS, checks MAC, strips L2 header, passes IP packet to L3.',
    })
  }
  if (device.layers.includes(3)) {
    steps.push({
      layer: 3,
      action: 'Reads IP packet — checks Destination IP address',
      note: 'Looks up routing table. Decrements TTL. Builds a NEW L2 frame with the next-hop MAC. Forwards.',
    })
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">
        Packet journey through this device
      </p>
      {steps.map(s => {
        const layer = OSI_LAYERS.find(l => l.number === s.layer)!
        return (
          <div key={s.layer} className="flex gap-3">
            <div className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center
                            text-[10px] font-black mt-0.5"
              style={{ backgroundColor: layer.color, color: '#fff' }}>
              {s.layer}
            </div>
            <div>
              <p className="text-xs font-semibold text-white">{s.action}</p>
              {s.note && <p className="text-[10px] text-gray-400 mt-0.5">{s.note}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function DevicesTab() {
  const [selected, setSelected] = useState<NetworkDevice>(NETWORK_DEVICES[1]) // switch default

  return (
    <div className="flex h-full overflow-hidden bg-gray-950 text-gray-200">

      {/* ── Device grid (left) ─────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-800 overflow-y-auto p-4 space-y-3">
        <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest mb-1">
          Network Devices
        </p>
        {NETWORK_DEVICES.map(d => (
          <DeviceCard key={d.id} device={d} isSelected={selected.id === d.id}
            onClick={() => setSelected(d)} />
        ))}

        {/* Key insight */}
        <div className="mt-4 bg-gray-900 rounded-xl p-3 text-[10px] text-gray-500 space-y-2">
          <p className="font-semibold text-gray-400">Key rule of thumb</p>
          <p>A device can only understand headers up to its highest operating layer. It ignores everything above.</p>
          <p>A <span className="text-gray-300 font-semibold">Hub</span> is blind to MAC and IP — it only sees electricity.</p>
          <p>A <span className="text-blue-400 font-semibold">Switch</span> can read MACs but ignores IP addresses.</p>
          <p>A <span className="text-green-400 font-semibold">Router</span> reads IP (and strips L2 frames) at every hop.</p>
        </div>
      </div>

      {/* ── Detail (right) ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="text-3xl">{selected.icon}</span>
          <div>
            <h2 className="text-lg font-bold text-white">{selected.name}</h2>
            <p className="text-xs font-mono text-gray-500">
              Operates at Layer{selected.layers.length > 1 ? 's' : ''} {selected.layers.sort().join(', ')}
              &nbsp;·&nbsp; Forwards on: {selected.forwardsOn}
            </p>
          </div>
        </div>

        {/* Layer stack (visual) */}
        <div>
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            OSI layers this device processes
          </p>
          <div className="flex gap-1.5">
            {[7, 6, 5, 4, 3, 2, 1].map(n => (
              <LayerPill key={n} num={n} active={selected.layers.includes(n)} />
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="bg-gray-900 rounded-xl p-4 text-sm text-gray-300 leading-relaxed">
          {selected.description}
        </div>

        {/* How it works */}
        <div className="bg-gray-900 rounded-xl p-4">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            How it works
          </p>
          <p className="text-sm text-gray-300">{selected.howItWorks}</p>
        </div>

        {/* Packet journey */}
        <div className="bg-gray-900 rounded-xl p-4">
          <PacketJourney device={selected} />
        </div>

        {/* Behaviour bullets */}
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            Behaviour examples
          </p>
          <ul className="space-y-1.5">
            {selected.example.map((ex, i) => (
              <li key={i} className="flex gap-2 text-xs text-gray-300">
                <span className="text-green-600 font-bold flex-shrink-0">→</span>
                <span>{ex}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Table (MAC or Routing) */}
        {selected.tableType && (
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
              {selected.tableType} (example)
            </p>
            <p className="text-[10px] text-gray-600 mb-2">{selected.tableDesc}</p>
            {selected.id === 'switch'    && <MacTable />}
            {selected.id === 'router'    && <RoutingTable />}
            {selected.id === 'l3switch'  && <RoutingTable />}
          </div>
        )}

        {/* Collision / broadcast domain callout */}
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              label: 'Collision domain',
              hub:  'One shared collision domain for all ports',
              sw:   'Each port = its own collision domain',
              rt:   'Each interface = its own collision domain',
              l3:   'Each port = its own collision domain',
            },
            {
              label: 'Broadcast domain',
              hub:  'One shared broadcast domain',
              sw:   'One broadcast domain per VLAN (unless trunked)',
              rt:   'Each interface = separate broadcast domain',
              l3:   'One per VLAN; inter-VLAN routing breaks domain',
            },
          ].map(row => (
            <div key={row.label} className="bg-gray-900 rounded-xl p-3">
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                {row.label}
              </p>
              <p className="text-xs text-gray-300">
                {selected.id === 'hub'     ? row.hub
                : selected.id === 'switch' ? row.sw
                : selected.id === 'router' ? row.rt
                : row.l3}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
