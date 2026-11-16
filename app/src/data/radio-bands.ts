// Canadian Amateur Radio frequency allocations (ISED)
// Basic licence: up to 250W, all amateur bands
// Advanced licence: full power, some exclusive sub-bands

export interface AmateurBand {
  id:          string
  name:        string        // "20m"
  fullName:    string        // "20 Metre Band"
  fLow:        number        // MHz
  fHigh:       number        // MHz
  wavelength:  number        // metres (approx)
  license:     'basic' | 'advanced-exclusive' | 'shared'
  modes:       string[]
  power:       { basic: number; advanced: number }  // watts PEP
  propagation: string
  typical:     string
  color:       string        // for spectrum display
  region:      'HF' | 'VHF' | 'UHF' | 'SHF'
  notes?:      string
}

export const AMATEUR_BANDS: AmateurBand[] = [
  {
    id: '160m', name: '160m', fullName: '160 Metre (Top Band)',
    fLow: 1.800, fHigh: 2.000, wavelength: 160,
    license: 'basic', modes: ['CW', 'Phone', 'Digital'],
    power: { basic: 250, advanced: 1000 },
    propagation: 'Ground wave by day; night-time sky wave — can reach across North America',
    typical: 'Challenging DX, low-noise locations required. Antenna must be huge (80 m dipole!)',
    color: '#7c3aed', region: 'HF',
  },
  {
    id: '80m', name: '80m', fullName: '80 Metre Band',
    fLow: 3.500, fHigh: 4.000, wavelength: 80,
    license: 'basic', modes: ['CW', 'Phone', 'Digital'],
    power: { basic: 250, advanced: 1000 },
    propagation: 'Regional at night (500–2000 km sky wave); noisy in summer',
    typical: 'Local/regional nets, rag-chewing. CW lower portion, phone upper.',
    color: '#dc2626', region: 'HF',
  },
  {
    id: '40m', name: '40m', fullName: '40 Metre Band',
    fLow: 7.000, fHigh: 7.300, wavelength: 40,
    license: 'basic', modes: ['CW', 'Phone', 'Digital'],
    power: { basic: 250, advanced: 1000 },
    propagation: 'Reliable day and night; excellent for 1000–5000 km paths',
    typical: 'Most popular HF band. International broadcasting shares this band.',
    color: '#ea580c', region: 'HF',
  },
  {
    id: '30m', name: '30m', fullName: '30 Metre Band',
    fLow: 10.100, fHigh: 10.150, wavelength: 30,
    license: 'basic', modes: ['CW', 'Digital'],   // NO phone/image
    power: { basic: 250, advanced: 250 },
    propagation: 'Near-constant worldwide path, day and night',
    typical: 'CW and digital only (WARC band). Narrow but great DX.',
    color: '#ca8a04', region: 'HF',
    notes: 'No phone or image permitted on this band',
  },
  {
    id: '20m', name: '20m', fullName: '20 Metre Band',
    fLow: 14.000, fHigh: 14.350, wavelength: 20,
    license: 'basic', modes: ['CW', 'Phone', 'Digital'],
    power: { basic: 250, advanced: 1500 },
    propagation: 'The workhorse DX band — worldwide paths during daylight',
    typical: 'Most popular DX band worldwide. Open almost 24h near solar maximum.',
    color: '#16a34a', region: 'HF',
  },
  {
    id: '17m', name: '17m', fullName: '17 Metre Band',
    fLow: 18.068, fHigh: 18.168, wavelength: 17,
    license: 'basic', modes: ['CW', 'Phone', 'Digital'],
    power: { basic: 250, advanced: 1500 },
    propagation: 'Excellent daytime DX; less crowded than 20m',
    typical: 'WARC band — contest-free. Relaxed DX operating.',
    color: '#0d9488', region: 'HF',
  },
  {
    id: '15m', name: '15m', fullName: '15 Metre Band',
    fLow: 21.000, fHigh: 21.450, wavelength: 15,
    license: 'basic', modes: ['CW', 'Phone', 'Digital'],
    power: { basic: 250, advanced: 1500 },
    propagation: 'Best near solar maximum — transcontinental during day',
    typical: 'Great for North American–European and –Pacific paths.',
    color: '#0891b2', region: 'HF',
  },
  {
    id: '12m', name: '12m', fullName: '12 Metre Band',
    fLow: 24.890, fHigh: 24.990, wavelength: 12,
    license: 'basic', modes: ['CW', 'Phone', 'Digital'],
    power: { basic: 250, advanced: 1500 },
    propagation: 'Solar cycle dependent; dies near solar minimum',
    typical: 'WARC band — wide open at solar peak, quiet otherwise.',
    color: '#2563eb', region: 'HF',
  },
  {
    id: '10m', name: '10m', fullName: '10 Metre Band',
    fLow: 28.000, fHigh: 29.700, wavelength: 10,
    license: 'basic', modes: ['CW', 'Phone', 'FM', 'Digital'],
    power: { basic: 250, advanced: 1500 },
    propagation: 'Incredible worldwide DX at solar max; dead at solar min',
    typical: 'Small antennas (5 m dipole!), excellent for new hams near solar peak.',
    color: '#7c3aed', region: 'HF',
  },
  {
    id: '6m', name: '6m', fullName: '6 Metre Band (Magic Band)',
    fLow: 50.000, fHigh: 54.000, wavelength: 6,
    license: 'basic', modes: ['CW', 'Phone', 'FM', 'Digital'],
    power: { basic: 250, advanced: 1500 },
    propagation: 'Unpredictable "magic" — sporadic-E gives sudden long-distance openings',
    typical: 'Famous for unexpected DX. FM simplex and repeaters on upper portion.',
    color: '#db2777', region: 'VHF',
  },
  {
    id: '2m', name: '2m', fullName: '2 Metre Band',
    fLow: 144.000, fHigh: 148.000, wavelength: 2,
    license: 'basic', modes: ['CW', 'Phone', 'FM', 'Digital', 'Satellite'],
    power: { basic: 250, advanced: 1500 },
    propagation: 'Mostly line-of-sight; repeaters extend range to ~100 km',
    typical: 'Most popular VHF band. Local FM repeaters (146.52 simplex calling). Great for new hams.',
    color: '#0ea5e9', region: 'VHF',
  },
  {
    id: '70cm', name: '70cm', fullName: '70 Centimetre Band',
    fLow: 430.000, fHigh: 450.000, wavelength: 0.70,
    license: 'basic', modes: ['CW', 'Phone', 'FM', 'Digital', 'ATV'],
    power: { basic: 250, advanced: 1500 },
    propagation: 'Line-of-sight; slightly shorter range than 2m',
    typical: 'FM repeaters, digital modes (D-STAR, DMR), amateur TV. Dual-band radios common.',
    color: '#10b981', region: 'UHF',
  },
  {
    id: '23cm', name: '23cm', fullName: '23 Centimetre Band',
    fLow: 1240.000, fHigh: 1300.000, wavelength: 0.23,
    license: 'advanced-exclusive', modes: ['CW', 'Phone', 'FM', 'Digital', 'ATV'],
    power: { basic: 250, advanced: 1500 },
    propagation: 'Microwave line-of-sight, some tropospheric ducting',
    typical: 'EME (moonbounce!), weak-signal work, high-def ATV.',
    color: '#f59e0b', region: 'SHF',
  },
]

// ── Modulation modes ──────────────────────────────────────────────────────────

export interface ModMode {
  id:       string
  name:     string
  fullName: string
  desc:     string
  bandwidth: string
  typical:  string
}

export const MOD_MODES: ModMode[] = [
  { id: 'CW',  name: 'CW',  fullName: 'Continuous Wave (Morse)',
    desc: 'Carrier turned on/off with a key. Narrowest bandwidth (~150 Hz). Best signal-to-noise.',
    bandwidth: '~150 Hz', typical: 'DX, low power (QRP), emergency comms' },
  { id: 'AM',  name: 'AM',  fullName: 'Amplitude Modulation',
    desc: 'Carrier amplitude varies with the audio. Contains two sidebands + carrier. Inefficient.',
    bandwidth: '~6 kHz', typical: 'Mostly legacy; some AM still on 160/80m; AM broadcast' },
  { id: 'SSB', name: 'SSB', fullName: 'Single Sideband',
    desc: 'One sideband of AM, carrier suppressed. 6 dB better than AM, half the bandwidth.',
    bandwidth: '~3 kHz', typical: 'Standard HF voice mode; LSB below 10 MHz, USB above' },
  { id: 'FM',  name: 'FM',  fullName: 'Frequency Modulation',
    desc: 'Carrier frequency varies with audio. Immune to amplitude noise. Needs wider bandwidth.',
    bandwidth: '~10–15 kHz', typical: 'VHF/UHF repeaters, local simplex, 10m FM' },
  { id: 'FT8', name: 'FT8', fullName: 'Fourier Transform 8-FSK',
    desc: 'Modern weak-signal digital mode. 15-second sequences. Works at −20 dB SNR.',
    bandwidth: '~50 Hz', typical: 'DX, solar minimum, very weak signals' },
]

// ── Phonetic alphabet ─────────────────────────────────────────────────────────

export const PHONETICS: Record<string, string> = {
  A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo',
  F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliet',
  K: 'Kilo', L: 'Lima', M: 'Mike', N: 'November', O: 'Oscar',
  P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango',
  U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray',
  Y: 'Yankee', Z: 'Zulu',
  '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four',
  '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Niner',
}

// ── Morse code ────────────────────────────────────────────────────────────────

export const MORSE: Record<string, string> = {
  A:'.-',   B:'-...', C:'-.-.', D:'-..', E:'.',  F:'..-.',
  G:'--.',  H:'....', I:'..',   J:'.---',K:'-.-', L:'.-..',
  M:'--',   N:'-.',   O:'---',  P:'.--.',Q:'--.-',R:'.-.',
  S:'...',  T:'-',    U:'..-',  V:'...-',W:'.--', X:'-..-',
  Y:'-.--', Z:'--..',
  '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-',
  '5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',
  '.':'.-.-.-', ',':'--..--', '?':'..--..', '/':'-..-.', ' ': ' ',
}
