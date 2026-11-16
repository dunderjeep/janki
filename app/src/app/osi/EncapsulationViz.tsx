'use client'

import { useState } from 'react'
import { OSI_LAYERS, buildEncapSteps, type EncapStep } from '@/data/osi-model'

const LAYER_COLOR: Record<number, string> = Object.fromEntries(
  OSI_LAYERS.map(l => [l.number, l.color])
)
const LAYER_NAME: Record<number, string> = Object.fromEntries(
  OSI_LAYERS.map(l => [l.number, l.name])
)

// ── PDU row — shows the encapsulated data at one layer ───────────────────────

function PDURow({ step, isActive, onClick }: {
  step:     EncapStep
  isActive: boolean
  onClick:  () => void
}) {
  const layerColor = LAYER_COLOR[step.layer]

  return (
    <button
      onClick={onClick}
      className={`w-full text-left mb-3 rounded-xl overflow-hidden transition-all
        ${isActive
          ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-950'
          : 'opacity-80 hover:opacity-100'}`}
      style={{ boxShadow: isActive ? `0 0 20px ${layerColor}55` : undefined }}>

      {/* Layer label */}
      <div className="flex items-center gap-2 px-3 py-1.5"
        style={{ backgroundColor: layerColor + '33', borderBottom: `1px solid ${layerColor}44` }}>
        <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black flex-shrink-0"
          style={{ backgroundColor: layerColor, color: '#fff' }}>
          {step.layer}
        </div>
        <span className="text-[10px] font-semibold" style={{ color: layerColor }}>
          {step.label}
        </span>
        <span className="ml-auto text-[9px] font-mono text-gray-500">
          PDU = {step.pduName}
        </span>
      </div>

      {/* PDU segments */}
      <div className="flex items-stretch bg-gray-900 min-h-[40px]">
        {step.segments.map((seg, i) => {
          const color     = LAYER_COLOR[seg.layer] ?? '#6b7280'
          const isHdr     = seg.type === 'header'
          const isTrl     = seg.type === 'trailer'
          const isXform   = seg.type === 'transform'
          return (
            <div
              key={i}
              className="relative flex items-center justify-center overflow-hidden text-center"
              style={{
                flex:            seg.width,
                backgroundColor: isXform ? color + '18'
                               : isHdr || isTrl ? color + '33'
                               : color + '11',
                borderRight:     i < step.segments.length - 1 ? `1px solid ${color}44` : undefined,
                borderLeft:      isTrl ? `2px dashed ${color}66` : undefined,
                border:          isXform ? `1px dashed ${color}55` : undefined,
                minWidth:        '30px',
              }}>
              <span className="px-1 text-[8px] leading-tight font-mono break-all"
                style={{ color: color }}>
                {isHdr   && <span className="block text-[7px] mb-0.5 opacity-60 uppercase">HDR</span>}
                {isTrl   && <span className="block text-[7px] mb-0.5 opacity-60 uppercase">TRL</span>}
                {isXform && <span className="block text-[7px] mb-0.5 opacity-60 uppercase tracking-widest">TRANSFORM (no new header)</span>}
                {seg.label}
              </span>
            </div>
          )
        })}
      </div>
    </button>
  )
}

// ── Detail panel for a selected step ─────────────────────────────────────────

function StepDetail({ step }: { step: EncapStep }) {
  const layer   = OSI_LAYERS.find(l => l.number === step.layer)
  const color   = LAYER_COLOR[step.layer]

  // L5 / L6 — transform layers, no distinct TCP/IP header
  if (step.isTransform) {
    return (
      <div className="space-y-4">
        {/* Big callout */}
        <div className="rounded-xl p-4 border"
          style={{ backgroundColor: color + '11', borderColor: color + '44' }}>
          <p className="text-xs font-bold mb-2" style={{ color }}>
            ⚠ This layer does NOT add a visible header in TCP/IP
          </p>
          <p className="text-sm text-gray-300 leading-relaxed">{step.transformNote}</p>
        </div>

        {/* OSI vs TCP/IP */}
        <div className="bg-gray-900 rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            OSI model vs TCP/IP reality
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-semibold text-white mb-1">OSI says</p>
              <p className="text-gray-400">L{step.layer} ({layer?.name}) is a discrete layer that handles {
                step.layer === 6
                  ? 'data format translation, encryption, and compression'
                  : 'session establishment, maintenance, and teardown'
              }.</p>
            </div>
            <div>
              <p className="font-semibold text-white mb-1">TCP/IP does</p>
              <p className="text-gray-400">{
                step.layer === 6
                  ? 'This work is done inside the Application layer. TLS is a library the app calls — not a separate protocol layer with its own IP-visible header.'
                  : 'Session state is tracked by TCP (connections) at L4, or by application tokens like cookies. No separate L5 header exists on the wire.'
              }</p>
            </div>
          </div>
        </div>

        {/* Real examples */}
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            Real-world examples of what {layer?.name} does
          </p>
          <ul className="space-y-1.5">
            {(step.layer === 6 ? [
              'TLS/SSL — encrypts HTTP → HTTPS (data becomes ciphertext)',
              'gzip / deflate — HTTP content-encoding compresses the body',
              'JPEG / PNG — image encoding format',
              'ASCII ↔ EBCDIC translation between different character sets',
              'Base64 encoding of binary data in email (MIME)',
            ] : [
              'TCP SYN / FIN handshake — session open and close (absorbed into L4 in TCP/IP)',
              'HTTP Keep-Alive — reuses a TCP connection for multiple requests',
              'TLS session ID — resuming a previous TLS session without full handshake',
              'RPC session tokens — Remote Procedure Call tracks which call is which',
              'NetBIOS session service — name-to-IP resolution on Windows networks',
            ]).map((ex, i) => (
              <li key={i} className="flex gap-2 text-xs text-gray-300">
                <span className="flex-shrink-0" style={{ color }}>→</span>
                <span>{ex}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Why it's in OSI */}
        <div className="bg-gray-900 rounded-xl p-3 text-[10px] text-gray-500">
          <span className="font-semibold text-gray-400">Why OSI still lists them: </span>
          The OSI model was designed in 1984 as a framework for building ANY network stack, not just TCP/IP.
          In theory, a different stack could have discrete L5/L6 headers. In practice, TCP/IP won, and it folds these concerns into
          {step.layer === 6 ? ' TLS and application libraries.' : ' TCP state and application code.'}
          &nbsp;On the CCNA exam you need to know they exist and what they do — not that they add packet headers.
        </div>
      </div>
    )
  }

  if (step.layer === 1) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-300">
          At the Physical layer there is <strong>no header</strong>. The entire frame from
          Layer 2 is converted into a stream of bits (electrical voltage levels, light pulses,
          or radio waves). The receiving device reads the bit stream and passes it back up.
        </p>
        <div className="bg-gray-900 rounded-xl p-3 font-mono text-[10px] text-green-400 break-all leading-relaxed">
          10101011 00000001 00000000 00000101 01000101 00000000 00000100 10110001...
          <span className="text-gray-600 ml-2">(raw bit stream)</span>
        </div>
        <p className="text-[10px] text-gray-500">
          Encoding schemes: Manchester, NRZ, 4B/5B, 8B/10B — convert bits to signal levels.
          The preamble (10101011) tells the NIC when to start reading.
        </p>
      </div>
    )
  }

  const headerSegs = step.segments.filter(s => s.type === 'header')
  const trailerSegs = step.segments.filter(s => s.type === 'trailer')

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-300">{layer?.responsibility}</p>

      {/* What this layer adds */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color }}>
          What Layer {step.layer} adds
        </p>
        <div className="space-y-1.5">
          {headerSegs.length > 0 && (
            <div className="flex items-start gap-2 text-xs">
              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-900 text-blue-300 flex-shrink-0 mt-0.5">HEADER</span>
              <span className="text-gray-300">Prepended to the front of the data from the layer above</span>
            </div>
          )}
          {trailerSegs.length > 0 && (
            <div className="flex items-start gap-2 text-xs">
              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-orange-900 text-orange-300 flex-shrink-0 mt-0.5">TRAILER</span>
              <span className="text-gray-300">Appended to the end (FCS for error checking)</span>
            </div>
          )}
        </div>
      </div>

      {/* Header fields for this layer */}
      {layer?.headerFields && (
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">
            Header fields added at L{step.layer}
          </p>
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="bg-gray-900 text-gray-500">
                  <th className="text-left px-3 py-1.5">Field</th>
                  <th className="text-right px-2 py-1.5 w-12">Bits</th>
                  <th className="text-left px-3 py-1.5">Value</th>
                  <th className="text-left px-3 py-1.5">Why</th>
                </tr>
              </thead>
              <tbody>
                {layer.headerFields.map(f => (
                  <tr key={f.name} className="border-t border-gray-800">
                    <td className="px-3 py-1.5 font-semibold" style={{ color }}>{f.name}</td>
                    <td className="px-2 py-1.5 text-right text-gray-600">{f.bits}</td>
                    <td className="px-3 py-1.5 text-green-400">{f.value}</td>
                    <td className="px-3 py-1.5 text-gray-400">{f.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {layer?.trailerFields && (
        <div>
          <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-2">Trailer fields</p>
          <div className="overflow-x-auto rounded-xl border border-orange-900/50">
            <table className="w-full text-[10px] font-mono">
              <tbody>
                {layer.trailerFields.map(f => (
                  <tr key={f.name} className="bg-orange-950/20">
                    <td className="px-3 py-1.5 font-semibold text-orange-400">{f.name}</td>
                    <td className="px-2 py-1.5 text-right text-gray-600">{f.bits}</td>
                    <td className="px-3 py-1.5 text-green-400">{f.value}</td>
                    <td className="px-3 py-1.5 text-gray-400">{f.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* De-encapsulation note */}
      <div className="bg-gray-900 rounded-xl p-3 text-[10px] text-gray-500">
        <span className="font-semibold text-gray-400">On receipt (de-encapsulation): </span>
        The receiving device at Layer {step.layer} reads this header, processes it,
        {step.layer === 2
          ? ' verifies the FCS, checks the destination MAC, and strips the Ethernet frame before passing the IP packet up to Layer 3.'
          : step.layer === 3
          ? ' checks the destination IP, decrements TTL (if routing), strips the IP header, and passes the TCP segment to Layer 4.'
          : step.layer === 4
          ? ' re-assembles segments using sequence numbers, acknowledges receipt (TCP), and passes the data stream to the application.'
          : ' passes data to the next layer up.'}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function EncapsulationViz() {
  const [appData,   setAppData]   = useState('HTTP GET /index.html')
  const [direction, setDirection] = useState<'down' | 'up'>('down')
  const [activeIdx, setActiveIdx] = useState(0)

  const steps = buildEncapSteps(appData)
  // "up" = de-encapsulation = reverse order
  const displaySteps = direction === 'down' ? steps : [...steps].reverse()
  const activeStep   = displaySteps[activeIdx]

  return (
    <div className="flex h-full overflow-hidden bg-gray-950 text-gray-200">

      {/* ── Left: PDU stack ────────────────────────────────────────────── */}
      <div className="w-[55%] flex-shrink-0 border-r border-gray-800 overflow-y-auto p-4">

        {/* Controls */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <label className="text-[9px] text-gray-500 uppercase tracking-wide block mb-1">
              Application data
            </label>
            <input value={appData} onChange={e => setAppData(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5
                         text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="text-[9px] text-gray-500 uppercase tracking-wide block mb-1">
              Direction
            </label>
            <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
              {[
                { id: 'down' as const, label: '↓ Encap' },
                { id: 'up'   as const, label: '↑ Decap' },
              ].map(d => (
                <button key={d.id} onClick={() => { setDirection(d.id); setActiveIdx(0) }}
                  className={`px-3 py-1.5 font-semibold transition-colors ${
                    direction === d.id
                      ? 'bg-green-700 text-white'
                      : 'bg-gray-900 text-gray-400 hover:text-gray-200'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Direction label */}
        <div className="flex items-center gap-2 mb-3 text-[9px] text-gray-600 font-semibold uppercase tracking-widest">
          {direction === 'down'
            ? <>
                <span>Sender side</span>
                <span className="text-green-700">→ headers ADDED as data descends</span>
              </>
            : <>
                <span>Receiver side</span>
                <span className="text-blue-700">→ headers STRIPPED as data ascends</span>
              </>}
        </div>

        {/* PDU rows */}
        {displaySteps.map((step, i) => (
          <PDURow key={step.layer} step={step} isActive={activeIdx === i}
            onClick={() => setActiveIdx(i)} />
        ))}

        {/* Legend */}
        <div className="mt-2 flex flex-wrap gap-3 text-[9px] font-mono">
          {OSI_LAYERS.slice().reverse().map(l => (
            <span key={l.number} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: l.color }} />
              <span className="text-gray-500">L{l.number} {l.name}</span>
            </span>
          ))}
          <span className="flex items-center gap-1 text-orange-500">
            <span className="border-l-2 border-dashed border-orange-500 h-2 inline-block" />
            Trailer
          </span>
        </div>
      </div>

      {/* ── Right: detail ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
            style={{ backgroundColor: LAYER_COLOR[activeStep.layer], color: '#fff' }}>
            {activeStep.layer}
          </div>
          <div>
            <h3 className="font-bold text-white text-sm">{LAYER_NAME[activeStep.layer]} Layer</h3>
            <p className="text-[10px] font-mono text-gray-500">
              {direction === 'down' ? 'Adding' : 'Stripping'} — PDU: {activeStep.pduName}
            </p>
          </div>
        </div>

        <StepDetail step={activeStep} />

        {/* Nav buttons */}
        <div className="flex gap-2 pt-2">
          <button
            disabled={activeIdx === 0}
            onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-gray-800 text-gray-300
                       disabled:opacity-30 hover:bg-gray-700 disabled:cursor-not-allowed">
            ← Previous
          </button>
          <button
            disabled={activeIdx === displaySteps.length - 1}
            onClick={() => setActiveIdx(i => Math.min(displaySteps.length - 1, i + 1))}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-green-800 text-green-200
                       disabled:opacity-30 hover:bg-green-700 disabled:cursor-not-allowed">
            Next →
          </button>
          <span className="flex items-center text-[10px] text-gray-600 ml-2">
            Step {activeIdx + 1} of {displaySteps.length}
          </span>
        </div>
      </div>
    </div>
  )
}
