// OSI Model — CCNA learning data

export interface HeaderField {
  name:  string
  bits:  number
  value: string   // example value
  desc:  string
}

export interface OSILayer {
  number:          number
  name:            string
  fullName:        string
  mnemonic:        string   // word in common mnemonic
  pdu:             string   // Protocol Data Unit name
  color:           string   // hex for display
  textColor:       string
  protocols:       string[]
  addresses:       string
  description:     string
  responsibility:  string
  headerFields?:   HeaderField[]
  trailerFields?:  HeaderField[]
  devices:         string[]
  realWorld:       string   // analogy
}

// Colours: L1=gray L2=blue L3=green L4=yellow L5=orange L6=purple L7=red
export const OSI_LAYERS: OSILayer[] = [
  {
    number: 7, name: 'Application', fullName: 'Application Layer',
    mnemonic: 'All',
    pdu: 'Data', color: '#ef4444', textColor: '#fff',
    protocols: ['HTTP', 'HTTPS', 'FTP', 'SMTP', 'POP3', 'IMAP', 'DNS', 'DHCP', 'SSH', 'Telnet', 'SNMP'],
    addresses: 'URL / Domain Name',
    description: 'The layer the end-user interacts with. Provides network services directly to applications.',
    responsibility: 'Identifies communication partners, checks resource availability, synchronises communication.',
    devices: ['PC', 'Server', 'Smartphone'],
    realWorld: 'The waiter at a restaurant — the part you interact with directly.',
    headerFields: [
      { name: 'Method',  bits: 32, value: 'GET',           desc: 'HTTP method (GET, POST, PUT…)' },
      { name: 'URI',     bits: 64, value: '/index.html',   desc: 'Requested resource path' },
      { name: 'Version', bits: 16, value: 'HTTP/1.1',      desc: 'Protocol version' },
      { name: 'Host',    bits: 48, value: 'example.com',   desc: 'Target hostname header' },
    ],
  },
  {
    number: 6, name: 'Presentation', fullName: 'Presentation Layer',
    mnemonic: 'People',
    pdu: 'Data', color: '#8b5cf6', textColor: '#fff',
    protocols: ['TLS', 'SSL', 'JPEG', 'MPEG', 'ASCII', 'EBCDIC', 'GIF', 'PNG'],
    addresses: 'N/A (no addressing)',
    description: 'Translates data between the application format and the network format. Handles encryption, compression, and encoding.',
    responsibility: 'Data translation, encryption/decryption, compression. Ensures data is readable by the application layer.',
    devices: ['PC', 'Server'],
    realWorld: 'A translator or interpreter — converts between languages so both parties understand.',
  },
  {
    number: 5, name: 'Session', fullName: 'Session Layer',
    mnemonic: 'Should',
    pdu: 'Data', color: '#f97316', textColor: '#fff',
    protocols: ['NetBIOS', 'RPC', 'PPTP', 'SIP', 'L2TP', 'PAP'],
    addresses: 'Session ID',
    description: 'Establishes, manages, and terminates sessions (conversations) between applications.',
    responsibility: 'Session setup and teardown, checkpointing, recovery. Keeps different application streams separate.',
    devices: ['PC', 'Server'],
    realWorld: 'A phone operator — connects the call, keeps it alive, and hangs up when done.',
  },
  {
    number: 4, name: 'Transport', fullName: 'Transport Layer',
    mnemonic: 'Do',
    pdu: 'Segment (TCP) / Datagram (UDP)', color: '#eab308', textColor: '#000',
    protocols: ['TCP', 'UDP', 'SCTP'],
    addresses: 'Port Number (0–65535)',
    description: 'End-to-end reliable (or unreliable) delivery between processes. Segments data and reassembles at the destination.',
    responsibility: 'Segmentation, flow control, error correction (TCP), multiplexing via port numbers.',
    devices: ['Firewall (L4)', 'Load balancer'],
    realWorld: 'The postal service — decides whether to send certified mail (TCP) or a postcard with no tracking (UDP).',
    headerFields: [
      { name: 'Source Port',      bits: 16, value: '52341',  desc: 'Ephemeral port of the sender' },
      { name: 'Destination Port', bits: 16, value: '80',     desc: 'Well-known port of the service' },
      { name: 'Sequence No.',     bits: 32, value: '1001',   desc: 'Byte position in data stream (TCP)' },
      { name: 'Ack. No.',         bits: 32, value: '1',      desc: 'Next expected byte from peer (TCP)' },
      { name: 'Flags',            bits: 6,  value: 'SYN/ACK','desc': 'Control bits (SYN, ACK, FIN, RST…)' },
      { name: 'Window Size',      bits: 16, value: '65535',  desc: 'Flow control buffer size in bytes' },
      { name: 'Checksum',         bits: 16, value: '0xA3F1', desc: 'Error detection over the segment' },
    ],
  },
  {
    number: 3, name: 'Network', fullName: 'Network Layer',
    mnemonic: 'Not',
    pdu: 'Packet', color: '#22c55e', textColor: '#fff',
    protocols: ['IPv4', 'IPv6', 'ICMP', 'OSPF', 'BGP', 'EIGRP', 'RIP', 'ARP'],
    addresses: 'IP Address (logical, e.g. 192.168.1.1)',
    description: 'Routes packets between different networks using logical (IP) addresses. Determines the best path.',
    responsibility: 'Logical addressing, routing, path determination, fragmentation.',
    devices: ['Router', 'Layer-3 switch', 'Firewall (L3)'],
    realWorld: 'A GPS + the highway system — knows the addresses and decides which roads to take.',
    headerFields: [
      { name: 'Version',        bits: 4,  value: '4',             desc: 'IPv4 or IPv6' },
      { name: 'Header Length',  bits: 4,  value: '20 bytes',      desc: 'Size of the IP header' },
      { name: 'DSCP / ToS',     bits: 8,  value: '0',             desc: 'Quality of Service priority' },
      { name: 'Total Length',   bits: 16, value: '1500',          desc: 'Header + payload in bytes' },
      { name: 'TTL',            bits: 8,  value: '64',            desc: 'Hops remaining; decremented by each router' },
      { name: 'Protocol',       bits: 8,  value: '6 (TCP)',       desc: 'Upper-layer protocol ID' },
      { name: 'Checksum',       bits: 16, value: '0x3F2A',        desc: 'Header integrity check' },
      { name: 'Source IP',      bits: 32, value: '10.0.0.5',      desc: 'Sender IP address' },
      { name: 'Destination IP', bits: 32, value: '93.184.216.34', desc: 'Receiver IP address' },
    ],
  },
  {
    number: 2, name: 'Data Link', fullName: 'Data Link Layer',
    mnemonic: 'Sausage',
    pdu: 'Frame', color: '#3b82f6', textColor: '#fff',
    protocols: ['Ethernet', 'Wi-Fi (802.11)', '802.1Q (VLANs)', 'PPP', 'ARP', 'STP'],
    addresses: 'MAC Address (48-bit, e.g. AA:BB:CC:DD:EE:FF)',
    description: 'Reliable delivery between directly connected nodes. Packages bits into frames and handles access to the physical medium.',
    responsibility: 'Framing, MAC addressing, error detection (FCS), media access control (CSMA/CD, CSMA/CA).',
    devices: ['Switch', 'Bridge', 'Wireless AP', 'NIC'],
    realWorld: 'The local street address on a letter — only relevant within your neighbourhood (local network segment).',
    headerFields: [
      { name: 'Dest. MAC',   bits: 48, value: 'FF:FF:FF:FF:FF:FF', desc: 'MAC of next-hop device (or broadcast)' },
      { name: 'Source MAC',  bits: 48, value: 'AA:BB:CC:11:22:33', desc: 'MAC of the sending NIC' },
      { name: 'EtherType',   bits: 16, value: '0x0800 (IPv4)',      desc: 'Type of encapsulated protocol' },
    ],
    trailerFields: [
      { name: 'FCS', bits: 32, value: '0xDEADBEEF', desc: 'Frame Check Sequence — CRC for error detection. Frame is discarded if it fails.' },
    ],
  },
  {
    number: 1, name: 'Physical', fullName: 'Physical Layer',
    mnemonic: 'Pizza',
    pdu: 'Bits (1s and 0s)', color: '#6b7280', textColor: '#fff',
    protocols: ['Ethernet (physical)', 'USB', 'DSL', 'Bluetooth (PHY)', 'RS-232', 'T1/E1'],
    addresses: 'N/A (no addressing — just signal levels)',
    description: 'Transmits raw bits over a physical medium. Deals with voltages, timing, and connector types.',
    responsibility: 'Bit encoding, signal transmission, cable specs, connector types, bit rate.',
    devices: ['Hub', 'Repeater', 'Cable', 'Wireless antenna', 'Modem'],
    realWorld: 'The actual road, electrical wires, or radio waves — the physical medium the signal travels on.',
  },
]

// ── Network Devices ───────────────────────────────────────────────────────────

export interface NetworkDevice {
  id:          string
  name:        string
  icon:        string
  layers:      number[]    // which OSI layers this device operates at
  description: string
  howItWorks:  string
  tableType?:  string      // "MAC table" | "Routing table" | null
  tableDesc?:  string
  example:     string[]    // bullet points of behaviour
  forwardsOn:  string      // "MAC" | "IP" | "signal"
}

export const NETWORK_DEVICES: NetworkDevice[] = [
  {
    id: 'hub', name: 'Hub', icon: '◎', layers: [1],
    description: 'A "dumb" repeater — receives bits on one port and blasts them out ALL other ports. No intelligence.',
    howItWorks: 'Operates only at Layer 1. Has no idea what a MAC or IP address is. Every device on the hub sees every other device\'s traffic.',
    forwardsOn: 'Signal (no decision — flood everything)',
    example: [
      'PC-A sends a frame → hub sends it to ALL ports (PC-B, PC-C, PC-D)',
      'Only the intended recipient accepts it; others discard it',
      'All devices share the same collision domain',
      'Only one device can transmit at a time (CSMA/CD required)',
      'Half-duplex only — causes collisions under load',
    ],
  },
  {
    id: 'switch', name: 'Switch', icon: '⊞', layers: [1, 2],
    description: 'Learns which MAC addresses live on which ports and forwards frames only to the correct destination.',
    howItWorks: 'Reads the Layer 2 (Ethernet) frame header to inspect source and destination MAC addresses. Builds a MAC address table. Breaks up collision domains — each port is its own collision domain.',
    forwardsOn: 'MAC Address',
    tableType: 'MAC Address Table',
    tableDesc: 'Maps MAC addresses → port numbers. Learned by watching source MACs of incoming frames.',
    example: [
      'PC-A (MAC: AA:...) sends to PC-B (MAC: BB:...) via switch',
      'Switch reads Source MAC: AA → records "AA is on Port 1"',
      'Switch reads Dest MAC: BB → looks up table → "BB is on Port 3" → forwards only to Port 3',
      'If MAC unknown → floods all ports (like a hub) until it learns',
      'Unknown unicast, broadcast, multicast → always flooded',
      'Each port = separate collision domain → full duplex possible',
    ],
  },
  {
    id: 'router', name: 'Router', icon: '⬡', layers: [1, 2, 3],
    description: 'Routes packets between different networks using IP addresses. The boundary between networks.',
    howItWorks: 'Reads both the Layer 2 frame (strips it) AND the Layer 3 IP packet inside. Makes forwarding decisions based on the destination IP address and its routing table. Rebuilds a new Layer 2 frame for each hop.',
    forwardsOn: 'IP Address',
    tableType: 'Routing Table',
    tableDesc: 'Maps IP networks → next-hop IP + exit interface. Built via static config or routing protocols (OSPF, BGP).',
    example: [
      'Router strips the incoming Ethernet frame (L2) to expose the IP packet (L3)',
      'Reads Destination IP → looks up routing table → finds next hop',
      'Decrements TTL by 1 (and recalculates IP checksum)',
      'Creates a NEW Ethernet frame with its own MAC as source, next-hop MAC as destination',
      'Routes between different IP subnets — switches cannot cross subnet boundaries',
      'Separates broadcast domains — broadcasts never cross a router',
    ],
  },
  {
    id: 'l3switch', name: 'Layer-3 Switch', icon: '⊟', layers: [1, 2, 3],
    description: 'A switch with built-in routing — handles both MAC-based switching and IP-based routing at hardware speed.',
    howItWorks: 'Combines a traditional switch (L2 MAC forwarding) with a routing engine (L3 IP routing) in one ASIC chip. Common in enterprise campus networks for inter-VLAN routing.',
    forwardsOn: 'MAC (intra-VLAN) / IP (inter-VLAN)',
    example: [
      'Within a VLAN → forwards by MAC (switch behaviour)',
      'Between VLANs → routes by IP (router behaviour)',
      'Much faster inter-VLAN routing than a separate router',
      'Uses SVIs (Switched Virtual Interfaces) as gateway IPs per VLAN',
    ],
  },
  {
    id: 'ap', name: 'Wireless AP', icon: '📶', layers: [1, 2],
    description: 'Bridges wireless (802.11) and wired (Ethernet) at Layer 2. Converts between radio signals and electrical frames.',
    howItWorks: 'Operates at L1 (radio frequency, encoding) and L2 (802.11 MAC → Ethernet MAC translation). Associates wireless clients and bridges them onto the wired LAN.',
    forwardsOn: 'MAC Address (bridges L2)',
    example: [
      'Client associates via 802.11 management frames (Probe, Auth, Association)',
      'Translates 802.11 frames ↔ 802.3 Ethernet frames',
      'All clients on same AP share the wireless collision domain (CSMA/CA)',
      'Does NOT route — routing happens at the router/L3 switch',
    ],
  },
]

// ── Encapsulation steps (for the animation) ───────────────────────────────────

export interface EncapStep {
  layer:    number
  label:    string
  pduName:  string
  // 'transform' = L5/L6 style: no discrete header added, data is modified in-place
  isTransform?: boolean
  transformNote?: string
  segments: { type: 'header' | 'data' | 'trailer' | 'transform'; label: string; layer: number; width: number }[]
}

export function buildEncapSteps(appData = 'HTTP GET /index.html'): EncapStep[] {
  return [
    {
      layer: 7, label: 'Application Layer — generates the raw data', pduName: 'Data',
      segments: [
        { type: 'data', label: appData, layer: 7, width: 10 },
      ],
    },
    {
      layer: 6,
      label: 'Presentation Layer — encrypts / compresses / encodes (no new header in TCP/IP)',
      pduName: 'Data (transformed)',
      isTransform: true,
      transformNote: 'L6 transforms the payload — e.g. TLS encrypts it, gzip compresses it, Base64 encodes it. ' +
        'In TCP/IP this is NOT a separate header you see in a packet capture. ' +
        'TLS adds a thin "record" wrapper but it lives inside the application stream, not as a distinct OSI header. ' +
        'The data blob changes shape; the surrounding packet structure does not.',
      segments: [
        { type: 'transform', label: '🔒 TLS-encrypted payload  (ciphertext — L6 encrypted the data; nobody below L6 can read it)', layer: 6, width: 10 },
      ],
    },
    {
      layer: 5,
      label: 'Session Layer — manages the conversation (no new header in TCP/IP)',
      pduName: 'Data',
      isTransform: true,
      transformNote: 'L5 tracks which application "session" this data belongs to — e.g. an RPC call ID or a NetBIOS session token. ' +
        'In TCP/IP stacks there is NO separate session header added to the packet. ' +
        'Session state is maintained inside the application (HTTP cookies, TLS session IDs) or is absorbed into TCP\'s connection state at L4. ' +
        'This is one reason OSI is called a "conceptual" model — L5 and L6 have no hardware headers you can point to.',
      segments: [
        { type: 'transform', label: '🔒 TLS payload  (session state tracked by app; no separate header added to wire)', layer: 5, width: 10 },
      ],
    },
    {
      layer: 4, label: 'Transport Layer — TCP adds segment header', pduName: 'Segment',
      segments: [
        { type: 'header', label: 'TCP Header  (Src:52341 → Dst:80  SEQ:1001  ACK  SYN  WIN:65535)', layer: 4, width: 4 },
        { type: 'data',   label: appData, layer: 7, width: 10 },
      ],
    },
    {
      layer: 3, label: 'Network Layer — IP adds packet header', pduName: 'Packet',
      segments: [
        { type: 'header', label: 'IP Header  (Src:10.0.0.5 → Dst:93.184.216.34  TTL:64  Proto:TCP)', layer: 3, width: 3 },
        { type: 'header', label: 'TCP Hdr', layer: 4, width: 2 },
        { type: 'data',   label: appData,  layer: 7, width: 10 },
      ],
    },
    {
      layer: 2, label: 'Data Link — Ethernet adds frame header + FCS trailer', pduName: 'Frame',
      segments: [
        { type: 'header',  label: 'Eth Header  (Dst MAC: AA:BB:CC…  Src MAC: 11:22:33…  Type:0x0800)', layer: 2, width: 3 },
        { type: 'header',  label: 'IP Hdr',  layer: 3, width: 1.5 },
        { type: 'header',  label: 'TCP Hdr', layer: 4, width: 1.2 },
        { type: 'data',    label: appData,   layer: 7, width: 6 },
        { type: 'trailer', label: 'FCS (32-bit CRC)', layer: 2, width: 1 },
      ],
    },
    {
      layer: 1, label: 'Physical Layer — Frame converted to bits', pduName: 'Bits',
      segments: [
        { type: 'data', label: '01101000 01100101 01101100 01101100 01101111 00100000 …  (raw electrical / optical / radio signal)', layer: 1, width: 14 },
      ],
    },
  ]
}
