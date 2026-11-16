export type ComponentType =
  | 'resistor' | 'capacitor' | 'inductor' | 'switch'
  | 'led-red' | 'led-green' | 'led-blue' | 'led-yellow'
  | 'diode' | 'zener'
  | 'voltage-dc' | 'voltage-ac' | 'current-source' | 'ground'
  | 'wire' | 'npn' | 'nmos'

export interface ComponentDef {
  type: ComponentType
  label: string
  shortLabel: string
  icon: string
  bgClass: string
  textClass: string
  defaultValue: number
  unit: string
  description: string
  category: 'passive' | 'semiconductor' | 'source' | 'misc'
}

export const COMPONENT_CATALOG: ComponentDef[] = [
  // ── Passive ────────────────────────────────────────────────
  {
    type: 'resistor', label: 'Resistor', shortLabel: 'R',
    icon: '⫛',
    bgClass: 'bg-amber-50', textClass: 'text-amber-800',
    defaultValue: 1000, unit: 'Ω',
    description: 'Limits current flow (Ohm\'s law: V = IR)',
    category: 'passive',
  },
  {
    type: 'capacitor', label: 'Capacitor', shortLabel: 'C',
    icon: '⊣⊢',
    bgClass: 'bg-sky-50', textClass: 'text-sky-800',
    defaultValue: 100e-6, unit: 'F',
    description: 'Stores charge; blocks DC, passes AC',
    category: 'passive',
  },
  {
    type: 'inductor', label: 'Inductor', shortLabel: 'L',
    icon: '∿',
    bgClass: 'bg-violet-50', textClass: 'text-violet-800',
    defaultValue: 10e-3, unit: 'H',
    description: 'Stores magnetic energy; opposes current change',
    category: 'passive',
  },
  {
    type: 'switch', label: 'Switch', shortLabel: 'SW',
    icon: '⏻',
    bgClass: 'bg-gray-50', textClass: 'text-gray-700',
    defaultValue: 1, unit: '',
    description: 'Open (0) or closed (1)',
    category: 'passive',
  },

  // ── Semiconductors ─────────────────────────────────────────
  {
    type: 'led-red', label: 'LED (Red)', shortLabel: 'LED',
    icon: '💡',
    bgClass: 'bg-red-50', textClass: 'text-red-700',
    defaultValue: 1.8, unit: 'Vf',
    description: 'Red LED — forward voltage ~1.8 V',
    category: 'semiconductor',
  },
  {
    type: 'led-green', label: 'LED (Green)', shortLabel: 'LED',
    icon: '💡',
    bgClass: 'bg-green-50', textClass: 'text-green-700',
    defaultValue: 2.2, unit: 'Vf',
    description: 'Green LED — forward voltage ~2.2 V',
    category: 'semiconductor',
  },
  {
    type: 'led-blue', label: 'LED (Blue)', shortLabel: 'LED',
    icon: '💡',
    bgClass: 'bg-blue-50', textClass: 'text-blue-700',
    defaultValue: 3.2, unit: 'Vf',
    description: 'Blue LED — forward voltage ~3.2 V',
    category: 'semiconductor',
  },
  {
    type: 'led-yellow', label: 'LED (Yellow)', shortLabel: 'LED',
    icon: '💡',
    bgClass: 'bg-yellow-50', textClass: 'text-yellow-700',
    defaultValue: 2.0, unit: 'Vf',
    description: 'Yellow LED — forward voltage ~2.0 V',
    category: 'semiconductor',
  },
  {
    type: 'diode', label: 'Diode', shortLabel: 'D',
    icon: '◁|',
    bgClass: 'bg-orange-50', textClass: 'text-orange-700',
    defaultValue: 0.7, unit: 'Vf',
    description: 'Rectifier diode — forward voltage ~0.7 V',
    category: 'semiconductor',
  },
  {
    type: 'zener', label: 'Zener', shortLabel: 'ZD',
    icon: '◁⌇',
    bgClass: 'bg-fuchsia-50', textClass: 'text-fuchsia-700',
    defaultValue: 5.1, unit: 'Vz',
    description: 'Zener diode — voltage regulation',
    category: 'semiconductor',
  },

  // ── Sources ────────────────────────────────────────────────
  {
    type: 'voltage-dc', label: 'DC Source', shortLabel: 'Vdc',
    icon: '⚡',
    bgClass: 'bg-indigo-50', textClass: 'text-indigo-700',
    defaultValue: 9, unit: 'V',
    description: 'DC voltage source (battery / bench supply)',
    category: 'source',
  },
  {
    type: 'voltage-ac', label: 'AC Source', shortLabel: 'Vac',
    icon: '〜',
    bgClass: 'bg-teal-50', textClass: 'text-teal-700',
    defaultValue: 5, unit: 'Vpk',
    description: 'AC sine source (default 1 kHz)',
    category: 'source',
  },
  {
    type: 'current-source', label: 'Current Source', shortLabel: 'I',
    icon: '↑',
    bgClass: 'bg-cyan-50', textClass: 'text-cyan-700',
    defaultValue: 0.01, unit: 'A',
    description: 'Ideal current source',
    category: 'source',
  },
  {
    type: 'ground', label: 'Ground', shortLabel: 'GND',
    icon: '⏚',
    bgClass: 'bg-gray-50', textClass: 'text-gray-600',
    defaultValue: 0, unit: '',
    description: 'Circuit reference (0 V)',
    category: 'source',
  },
  {
    type: 'wire', label: 'Wire', shortLabel: '—',
    icon: '—',
    bgClass: 'bg-gray-50', textClass: 'text-gray-600',
    defaultValue: 0, unit: '',
    description: 'Zero-resistance connection',
    category: 'misc',
  },
]

export function getComponentDef(type: ComponentType): ComponentDef {
  return COMPONENT_CATALOG.find(c => c.type === type) ?? COMPONENT_CATALOG[0]
}

// ── Preset circuits ────────────────────────────────────────────────────────

export interface PresetComp {
  id:    string
  type:  ComponentType
  hole1: string
  hole2: string
  value: number
  label?: string
}

export interface Preset {
  name:        string
  description: string
  components:  PresetComp[]
  probeNode?:  string
}

export const PRESETS: Preset[] = [
  {
    name: 'LED + Resistor',
    description: '9 V battery → 330 Ω resistor → red LED → GND',
    probeNode: 'R3',
    components: [
      { id: 'v1', type: 'voltage-dc', hole1: 'L+1', hole2: 'L-1', value: 9  },
      { id: 'w1', type: 'wire',       hole1: 'L+1', hole2: 'a1',  value: 0  },
      { id: 'r1', type: 'resistor',   hole1: 'a1',  hole2: 'a4',  value: 330 },
      { id: 'd1', type: 'led-red',    hole1: 'a4',  hole2: 'a7',  value: 1.8 },
      { id: 'g1', type: 'ground',     hole1: 'a7',  hole2: 'L-1', value: 0  },
    ],
  },
  {
    name: 'Voltage Divider',
    description: '9 V → R1 (1 kΩ) → node A → R2 (2.2 kΩ) → GND',
    probeNode: 'R4',
    components: [
      { id: 'v1', type: 'voltage-dc', hole1: 'L+1', hole2: 'L-1', value: 9    },
      { id: 'w1', type: 'wire',       hole1: 'L+1', hole2: 'a1',  value: 0    },
      { id: 'r1', type: 'resistor',   hole1: 'a1',  hole2: 'a4',  value: 1000 },
      { id: 'r2', type: 'resistor',   hole1: 'a4',  hole2: 'a8',  value: 2200 },
      { id: 'g1', type: 'ground',     hole1: 'a8',  hole2: 'L-1', value: 0    },
    ],
  },
  {
    name: 'RC Low-Pass Filter',
    description: '5 V AC → 1 kΩ → 100 µF → GND (fc ≈ 1.6 Hz)',
    probeNode: 'R5',
    components: [
      { id: 'v1', type: 'voltage-ac', hole1: 'L+1', hole2: 'L-1', value: 5      },
      { id: 'w1', type: 'wire',       hole1: 'L+1', hole2: 'a1',  value: 0      },
      { id: 'r1', type: 'resistor',   hole1: 'a1',  hole2: 'a4',  value: 1000   },
      { id: 'c1', type: 'capacitor',  hole1: 'a4',  hole2: 'a8',  value: 100e-6 },
      { id: 'g1', type: 'ground',     hole1: 'a8',  hole2: 'L-1', value: 0      },
    ],
  },
  {
    name: 'Series RLC',
    description: '10 V AC → 100 Ω → 10 mH → 100 µF → GND (resonance ≈ 1.6 kHz)',
    probeNode: 'R5',
    components: [
      { id: 'v1', type: 'voltage-ac', hole1: 'L+1', hole2: 'L-1', value: 10     },
      { id: 'w1', type: 'wire',       hole1: 'L+1', hole2: 'a1',  value: 0      },
      { id: 'r1', type: 'resistor',   hole1: 'a1',  hole2: 'a4',  value: 100    },
      { id: 'l1', type: 'inductor',   hole1: 'a4',  hole2: 'a7',  value: 10e-3  },
      { id: 'c1', type: 'capacitor',  hole1: 'a7',  hole2: 'a11', value: 100e-6 },
      { id: 'g1', type: 'ground',     hole1: 'a11', hole2: 'L-1', value: 0      },
    ],
  },
  {
    name: 'Wheatstone Bridge',
    description: '9 V → two parallel voltage divider arms → measure imbalance',
    probeNode: 'R3',
    components: [
      { id: 'v1', type: 'voltage-dc', hole1: 'L+1', hole2: 'L-1', value: 9    },
      { id: 'w1', type: 'wire',       hole1: 'L+1', hole2: 'a1',  value: 0    },
      { id: 'r1', type: 'resistor',   hole1: 'a1',  hole2: 'a4',  value: 1000 },
      { id: 'r2', type: 'resistor',   hole1: 'a4',  hole2: 'a8',  value: 1000 },
      { id: 'r3', type: 'resistor',   hole1: 'a1',  hole2: 'e4',  value: 1000 },
      { id: 'r4', type: 'resistor',   hole1: 'e4',  hole2: 'e8',  value: 2200 },
      { id: 'g1', type: 'ground',     hole1: 'a8',  hole2: 'L-1', value: 0    },
      { id: 'g2', type: 'wire',       hole1: 'e8',  hole2: 'L-1', value: 0    },
    ],
  },
]
