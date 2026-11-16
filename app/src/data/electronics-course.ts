// ── Electronics Course Data ────────────────────────────────────────────────
// Structured curriculum for learning electronics using the simulator.

export interface LessonStep {
  text:    string
  detail?: string   // optional extra explanation shown on hover/expand
}

export interface Lesson {
  id:              string
  moduleId:        string
  title:           string
  icon:            string
  duration:        string          // e.g. "5 min"
  difficulty:      'beginner' | 'intermediate' | 'advanced'
  concept:         string          // one-liner summary
  theory:          string          // plain-text explanation (2-4 sentences)
  steps:           LessonStep[]
  successCriteria: string          // what to look for in the results
  challenge?:      string          // optional bonus question
  presetName?:     string          // name matching PRESETS array
}

export interface CourseModule {
  id:          string
  title:       string
  icon:        string
  description: string
  colorClass:  string   // tailwind bg/text colour token
}

// ── Modules ────────────────────────────────────────────────────────────────

export const COURSE_MODULES: CourseModule[] = [
  {
    id:          'dc',
    title:       'DC Fundamentals',
    icon:        '⚡',
    description: 'Voltage, current, resistance and Ohm\'s Law',
    colorClass:  'amber',
  },
  {
    id:          'power',
    title:       'Power & Energy',
    icon:        '🔥',
    description: 'Power dissipation and Kirchhoff\'s Laws',
    colorClass:  'blue',
  },
  {
    id:          'ac',
    title:       'AC & Reactive Components',
    icon:        '〜',
    description: 'AC sources, capacitors, inductors and filters',
    colorClass:  'teal',
  },
  {
    id:          'semi',
    title:       'Semiconductors',
    icon:        '💡',
    description: 'Diodes, LEDs, Zener regulators and bridges',
    colorClass:  'purple',
  },
]

// ── Lessons ────────────────────────────────────────────────────────────────

export const LESSONS: Lesson[] = [

  // ── Module 1: DC Fundamentals ─────────────────────────────────────────

  {
    id:         'ohms-law',
    moduleId:   'dc',
    title:      "Ohm's Law",
    icon:       '⫛',
    duration:   '5 min',
    difficulty: 'beginner',
    concept:    'V = I × R — voltage, current and resistance are linked',
    theory:
      "Ohm's Law (V = I × R) is the foundation of circuit analysis. " +
      "A resistor with resistance R (ohms, Ω) limits current to I = V/R amperes " +
      "when voltage V is applied across it. " +
      "Double the voltage → double the current; double the resistance → half the current. " +
      "Every practical DC circuit design starts here.",
    steps: [
      {
        text:   'Open the **Source** tab in the left panel. Select **DC Source** ⚡ and set the value to **9** V. Click the **⊕ rail row 1** (marked **L+1** — the red ⊕ column just left of column A) then the **⊖ rail row 1** (**L-1**, the leftmost column).',
        detail: 'The two thin columns to the LEFT of column A are the power rails: ⊕ (red/positive) and ⊖ (black/negative). L+N = left positive rail row N. L−N = left negative rail row N.',
      },
      {
        text:   'Select **Wire** (Misc tab). Click the **⊕ rail row 1** (**L+1**) then **a1** to connect the positive rail to column A, row 1.',
        detail: 'Wires have zero resistance — they just extend a connection to a reachable hole.',
      },
      {
        text:   'Open the **Passive** tab. Select **Resistor** ⫛ and set the value to **1000** Ω. Click **a1** then **a5** to span four rows.',
        detail: 'Breadboard columns a–e share a bus per row. Spanning a–e on the same row = short; spanning rows = component.',
      },
      {
        text:   'Back in **Source**, select **Ground** ⏚. Click **a5** then the **⊖ rail row 1** (**L-1**, the leftmost column) to complete the circuit back to the negative rail.',
      },
      {
        text:   'Click **▶ Simulate** in the toolbar.',
      },
      {
        text:   'Click the resistor on the breadboard to select it. Check the **Multimeter** in the right panel.',
        detail: 'The multimeter reads voltage across the selected component and current through it.',
      },
      {
        text:   'Read the values — Voltage ≈ **9 V**, Current ≈ **9 mA**. Verify: I = V/R = 9/1000 = 0.009 A ✓',
      },
    ],
    successCriteria:
      'Multimeter shows ~9 V and ~9 mA. Current × Resistance = 9 mA × 1 kΩ = 9 V — Ohm\'s Law confirmed.',
    challenge:
      'Change the resistor to 470 Ω and re-simulate. Does the current roughly double as predicted (≈19.1 mA)?',
  },

  {
    id:         'series-resistors',
    moduleId:   'dc',
    title:      'Series Resistors',
    icon:       '⫛⫛',
    duration:   '6 min',
    difficulty: 'beginner',
    concept:    'R_total = R1 + R2 — same current flows through all',
    theory:
      "When resistors are connected end-to-end (series), total resistance is the sum: " +
      "R_total = R1 + R2 + … All series resistors share the same current " +
      "I = V_supply / R_total. " +
      "Each resistor drops a voltage proportional to its value: V_n = I × R_n. " +
      "The voltage drops must add up to the supply voltage — a consequence of Kirchhoff's Voltage Law.",
    steps: [
      { text: 'Place a **DC Source** (9 V) at **L+1** / **L-1**.' },
      { text: 'Place a **Wire** from **L+1** to **a1**.' },
      {
        text:   'Select **Resistor**, set to **1000** Ω. Click **a1** → **a4**.',
        detail: 'This is R1 = 1 kΩ.',
      },
      {
        text:   'Select **Resistor**, set to **2000** Ω. Click **a4** → **a8**.',
        detail: 'R2 = 2 kΩ. Notice R2\'s hole1 = R1\'s hole2 — they share the middle node.',
      },
      { text: 'Place **Ground** from **a8** → **L-1**.' },
      { text: 'Click **▶ Simulate**.' },
      { text: 'Select R1 (1 kΩ): observe Voltage ≈ **3 V**, Current ≈ **3 mA**.' },
      { text: 'Select R2 (2 kΩ): observe Voltage ≈ **6 V** — twice as much, as expected.' },
    ],
    successCriteria:
      'Total current = 9V / 3kΩ = 3 mA through both. V_R1 = 1kΩ × 3mA = 3 V. V_R2 = 2kΩ × 3mA = 6 V. Sum = 9 V ✓',
    challenge:
      'Add a third resistor (3 kΩ) in series from a8 → a13. Move the Ground there. What is the new current and each voltage drop?',
  },

  {
    id:         'voltage-divider',
    moduleId:   'dc',
    title:      'Voltage Divider',
    icon:       '÷',
    duration:   '8 min',
    difficulty: 'beginner',
    concept:    'Vout = Vin × R2/(R1+R2) — split voltage by ratio',
    theory:
      "A voltage divider uses two series resistors to produce an output voltage " +
      "that is a precise fraction of the input: Vout = Vin × R2/(R1+R2). " +
      "This is used everywhere — setting bias voltages, interfacing sensors, " +
      "scaling signals for ADC inputs. " +
      "The ratio, not the absolute values, determines the output.",
    presetName: 'Voltage Divider',
    steps: [
      { text: 'Click **Voltage Divider** in the Presets toolbar to load the circuit.' },
      { text: 'Click **▶ Simulate**.' },
      {
        text:   'Find the **Node Voltages** table in the right panel. The middle node should show ≈ **6.19 V**.',
        detail: '9 × 2200 / (1000 + 2200) = 6.1875 V',
      },
      { text: 'Select R1 (1 kΩ). Note its voltage drop = 9 − 6.19 ≈ 2.81 V.' },
      { text: 'Select R2 (2.2 kΩ). Note its voltage = 6.19 V (the output).' },
      {
        text:   'Click R2 to select it, then use the **Value Editor** to change R2 to **4700** Ω. Click **▶ Simulate** again.',
        detail: 'New Vout = 9 × 4700/(1000+4700) = 9 × 0.825 ≈ 7.42 V.',
      },
    ],
    successCriteria:
      'With R2=2.2kΩ: Vout ≈ 6.19 V. With R2=4.7kΩ: Vout ≈ 7.42 V. The ratio changes the output.',
    challenge:
      'What R1/R2 combination gives exactly 3.3 V from a 9 V supply? Hint: R2/(R1+R2) = 3.3/9 ≈ 0.367.',
  },

  {
    id:         'parallel-resistors',
    moduleId:   'dc',
    title:      'Parallel Resistors',
    icon:       '∥',
    duration:   '7 min',
    difficulty: 'beginner',
    concept:    '1/R_total = 1/R1 + 1/R2 — lower combined resistance',
    theory:
      "Parallel resistors share the same terminal voltage but split current between branches. " +
      "The equivalent resistance 1/R_total = 1/R1 + 1/R2 is always less than either resistor alone. " +
      "For two equal resistors: R_total = R/2. " +
      "Parallel branches are independent — adding a branch increases total current while the voltage stays the same.",
    steps: [
      { text: 'Place a **DC Source** (9 V) at **L+1** / **L-1**.' },
      { text: 'Place **Wire** from **L+1** → **a1** and another from **L+1** → **e1** (two branches from the top).' },
      { text: 'Place **Resistor** 1 kΩ from **a1** → **a5**.' },
      { text: 'Place **Resistor** 1 kΩ from **e1** → **e5**.' },
      {
        text:   'Place **Wire** from **a5** → **e5** to join the two bottom nodes.',
        detail: 'This short-circuits the two bottom resistor ends — making them share the same node.',
      },
      { text: 'Place **Ground** from **a5** → **L-1**.' },
      { text: 'Click **▶ Simulate**. Select each resistor in turn.' },
      { text: 'Observe: each resistor shows **9 V** and **9 mA**. Total current from source = **18 mA** → R_eq = 9/0.018 = 500 Ω ✓' },
    ],
    successCriteria:
      'Both resistors: 9 V, 9 mA. Source current = 18 mA. Equivalent resistance = 500 Ω = 1kΩ/2.',
    challenge:
      'Replace one 1 kΩ with 2.2 kΩ. Calculate the expected R_eq = (1k×2.2k)/(1k+2.2k). Verify with the simulator.',
  },

  // ── Module 2: Power & Energy ──────────────────────────────────────────

  {
    id:         'power-dissipation',
    moduleId:   'power',
    title:      'Power Dissipation',
    icon:       '🔥',
    duration:   '6 min',
    difficulty: 'beginner',
    concept:    'P = V × I = V²/R — resistors convert energy to heat',
    theory:
      "Power (watts) is the rate of energy dissipation: P = V × I = I²R = V²/R. " +
      "Every resistor has a maximum power rating — typically 0.25 W for small through-hole resistors. " +
      "Exceeding it causes overheating and failure. " +
      "Knowing P = V²/R lets you pick a safe minimum resistance for a given supply voltage.",
    presetName: 'Voltage Divider',
    steps: [
      { text: 'Load the **Voltage Divider** preset. Click **▶ Simulate**.' },
      {
        text:   'Scroll to the **Power Dissipation** table in the right panel. Note power in each resistor.',
        detail: 'R1 (1kΩ) at 9V divider: P = I²R. I = 9/3.2kΩ ≈ 2.8 mA. P_R1 ≈ 2.8mA² × 1kΩ ≈ 7.9 mW.',
      },
      {
        text:   'Select R1. Use the **Value Editor** to change it to **100** Ω. Re-simulate.',
        detail: 'New total R = 2300 Ω. I = 9/2300 ≈ 3.9 mA. P_R1 = 3.9mA² × 100 ≈ 1.5 mW.',
      },
      { text: 'Now change R1 to **33** Ω and re-simulate. Check the power table.' },
      {
        text:   'With R1=33Ω: I ≈ 9/2233 ≈ 4.03 mA. P_R1 = 4.03mA² × 33 ≈ 0.54 mW. Still safe.',
        detail: 'The large R2 (2.2kΩ) dominates total resistance, protecting R1 from excessive current.',
      },
      { text: 'For standalone R1: place 9V + **100 Ω** resistor + Ground. Simulate. P = V²/R = 81/100 = **810 mW** — over a typical 0.25 W rating!' },
    ],
    successCriteria:
      'Observed that P = V²/R in the power table. Standalone 100 Ω at 9 V dissipates 810 mW — exceeds common 0.25 W resistor limit.',
    challenge:
      'A 0.25 W resistor at 9 V: minimum safe R = V²/P_max = 81/0.25 = 324 Ω. Verify this is the threshold using the simulator.',
  },

  {
    id:         'kvl',
    moduleId:   'power',
    title:      "Kirchhoff's Voltage Law",
    icon:       '∮',
    duration:   '8 min',
    difficulty: 'intermediate',
    concept:    'Voltage drops around any closed loop sum to zero',
    theory:
      "Kirchhoff's Voltage Law (KVL): the algebraic sum of all voltages around any closed loop is zero. " +
      "This is energy conservation — energy gained from sources equals energy lost in passive elements. " +
      "In a series circuit: V_source = V_R1 + V_R2 + … " +
      "KVL is used to write equations for any mesh in a circuit, enabling systematic analysis.",
    steps: [
      {
        text:   'Build a series circuit: **DC Source** 9 V (L+1→L-1), **Wire** L+1→a1, **Resistor** 1 kΩ (a1→a4), **Resistor** 2.2 kΩ (a4→a8), **Ground** (a8→L-1).',
        detail: 'This is the Voltage Divider without using the preset — build it manually for practice.',
      },
      { text: 'Click **▶ Simulate**.' },
      {
        text:   'Check **Node Voltages**. Identify each node: L+1 ≈ 9 V, the midpoint ≈ 6.19 V, L-1 = 0 V.',
      },
      { text: 'Select R1: V_drop = 9 − 6.19 = 2.81 V. Select R2: V_drop ≈ 6.19 V.' },
      { text: 'Verify KVL: V_source = V_R1 + V_R2 → 9 = 2.81 + 6.19 ✓' },
      {
        text:   'Select the **DC Source** itself (click it on the breadboard). Multimeter shows 9 V — the source "rises" in voltage.',
        detail: 'Going around the loop: +9 V (source) − 2.81 V (R1) − 6.19 V (R2) = 0. KVL is satisfied.',
      },
    ],
    successCriteria:
      'V_R1 + V_R2 = V_source. The node voltage table shows decreasing voltages from supply to GND, each step equal to a component\'s V_drop.',
    challenge:
      'Add a third resistor (3.3 kΩ) in the chain. Re-simulate. Does V_R1 + V_R2 + V_R3 still equal 9 V?',
  },

  // ── Module 3: AC & Reactive Components ───────────────────────────────

  {
    id:         'ac-oscilloscope',
    moduleId:   'ac',
    title:      'AC Source & Oscilloscope',
    icon:       '〜',
    duration:   '5 min',
    difficulty: 'beginner',
    concept:    'AC voltages alternate; oscilloscope shows voltage vs. time',
    theory:
      "Alternating current (AC) periodically reverses direction. " +
      "Amplitude is measured in peak volts (Vpk) or RMS where V_rms = Vpk / √2 ≈ 0.707 × Vpk. " +
      "Frequency (Hz) = cycles per second. " +
      "The oscilloscope plots voltage vs. time — essential for diagnosing AC behaviour. " +
      "Mains power is ~50-60 Hz AC; audio is 20 Hz – 20 kHz; the simulator uses 1 kHz by default.",
    steps: [
      {
        text:   'In the **Source** tab select **AC Source** 〜. Set value to **5** Vpk. Place at **L+1** / **L-1**.',
        detail: 'Vpk = peak voltage amplitude. RMS = 5/√2 ≈ 3.54 V.',
      },
      { text: 'Place **Wire** from **L+1** → **a1**.' },
      { text: 'Place **Resistor** 1 kΩ from **a1** → **a5**.' },
      { text: 'Place **Ground** from **a5** → **L-1**.' },
      { text: 'Click **▶ Simulate**.' },
      {
        text:   'Watch the **Oscilloscope** in the right panel — a sine wave should appear.',
        detail: 'The scope shows voltage at the resistor node over time. For a purely resistive load, voltage and current are in phase.',
      },
      { text: 'Select the resistor. The Multimeter shows a positive voltage (magnitude of AC swing). Note: it shows the DC-equivalent (RMS) magnitude.' },
    ],
    successCriteria:
      'Sine wave visible on oscilloscope with ≈5 V peak amplitude. Resistor multimeter shows ~3.5 V (RMS).',
    challenge:
      'Change the AC source to 10 Vpk and re-simulate. Does the waveform amplitude double on the scope?',
  },

  {
    id:         'rc-filter',
    moduleId:   'ac',
    title:      'RC Low-Pass Filter',
    icon:       '⊣⊢',
    duration:   '10 min',
    difficulty: 'intermediate',
    concept:    'Capacitors block DC and pass AC; RC circuits filter by frequency',
    theory:
      "A capacitor stores charge and opposes voltage change: its impedance Z_C = 1/(2πfC) decreases as frequency increases. " +
      "In an RC series circuit, the voltage across the capacitor is the filtered output. " +
      "The cut-off frequency fc = 1/(2πRC) marks where the output is −3 dB (≈70% of input). " +
      "Below fc: passes through. Above fc: signal is attenuated — hence 'low-pass filter'.",
    presetName: 'RC Low-Pass Filter',
    steps: [
      { text: 'Load the **RC Low-Pass Filter** preset.' },
      { text: 'Click **▶ Simulate**. Observe the **Oscilloscope** — note the two waveforms.' },
      {
        text:   'Select the **resistor** (1 kΩ). Its voltage is the drop across R — the "blocked" share.',
        detail: 'At 1 kHz (simulator default) and 100 µF: fc = 1/(2π×1k×100µ) ≈ 1.6 Hz. We\'re 625× above fc — heavy attenuation!',
      },
      {
        text:   'Select the **capacitor** (100 µF). Its voltage is V_out — much lower than V_in because 1 kHz >> fc.',
      },
      {
        text:   'Click the capacitor and use **Value Editor** to change to **1e-6** (1 µF). Re-simulate.',
        detail: 'New fc = 1/(2π×1000×1e-6) ≈ 159 Hz. Still below 1 kHz, so still attenuated but less so.',
      },
      { text: 'Check the **Node Voltages** — V_out has changed (closer to V_in with lower C means higher fc).' },
    ],
    successCriteria:
      'V_capacitor << V_source at 1 kHz because we\'re far above fc. Reducing C raises fc, reducing attenuation.',
    challenge:
      'What capacitor value gives fc = 1 kHz with R = 1 kΩ? C = 1/(2π × 1000 × 1000) ≈ 159 nF. Verify in the simulator.',
  },

  {
    id:         'rlc-resonance',
    moduleId:   'ac',
    title:      'Series RLC Resonance',
    icon:       '∿',
    duration:   '10 min',
    difficulty: 'intermediate',
    concept:    'Inductor + capacitor resonate at fo = 1/(2π√LC)',
    theory:
      "An inductor's impedance (Z_L = 2πfL) increases with frequency while the capacitor's (Z_C = 1/2πfC) decreases. " +
      "They cancel exactly at the resonant frequency fo = 1/(2π√LC), leaving only resistance to limit current. " +
      "At resonance, current is maximum and the voltage across L and C can be much larger than the source (Q-factor amplification). " +
      "This principle underlies radio tuning, bandpass filters and oscillators.",
    presetName: 'Series RLC',
    steps: [
      { text: 'Load **Series RLC** preset. Click **▶ Simulate**.' },
      {
        text:   'Observe the **Oscilloscope** — multiple node voltages displayed.',
        detail: 'The preset has L = 10 mH, C = 100 µF: fo = 1/(2π√(0.01×100e-6)) ≈ 159 Hz. Sim runs at 1 kHz — above resonance.',
      },
      { text: 'Select the **inductor** (10 mH). Note its voltage. Select the **capacitor** (100 µF). Note its voltage.' },
      { text: 'Check the **Power Dissipation** table — only the **resistor** shows real power. L and C store/return energy (zero net power).' },
      {
        text:   'Change the inductor to **1e-3** H (1 mH) to push fo closer to 1 kHz: fo = 1/(2π√(0.001×100e-6)) ≈ 503 Hz. Re-simulate.',
        detail: 'Still below 1 kHz, but closer to resonance — watch current magnitude increase.',
      },
    ],
    successCriteria:
      'Resistor dissipates power; inductor and capacitor do not. Voltages across L and C can exceed supply voltage at near-resonance.',
    challenge:
      'Reduce the resistor to 10 Ω (sharpens resonance, higher Q). How does the voltage across the capacitor change? Q = (1/R)√(L/C).',
  },

  // ── Module 4: Semiconductors ──────────────────────────────────────────

  {
    id:         'led-circuit',
    moduleId:   'semi',
    title:      'LED Circuit',
    icon:       '💡',
    duration:   '6 min',
    difficulty: 'beginner',
    concept:    'LEDs need a current-limiting resistor to avoid burning out',
    theory:
      "A Light Emitting Diode (LED) conducts in one direction, dropping a characteristic forward voltage (Vf). " +
      "Current through the LED must be limited: I = (V_supply − Vf) / R_limit. " +
      "Typical safe LED current is 10–20 mA. " +
      "Without a series resistor, the LED draws unlimited current and fails instantly.",
    presetName: 'LED + Resistor',
    steps: [
      { text: 'Load the **LED + Resistor** preset. Click **▶ Simulate**.' },
      {
        text:   'Select the **LED** (red). In the Multimeter observe V ≈ **1.8 V** (forward voltage drop Vf).',
        detail: 'Vf for red LED ≈ 1.8 V. Green ≈ 2.2 V. Blue ≈ 3.2 V. It\'s a material property.',
      },
      {
        text:   'Select the **Resistor** (330 Ω). Note: V_R = 9 − 1.8 = 7.2 V, Current I = 7.2/330 ≈ **21.8 mA**.',
        detail: 'This is the current flowing through the LED — within safe range.',
      },
      { text: 'Check the **Power Dissipation** table. The resistor dissipates ~157 mW.' },
      {
        text:   'Change the resistor to **100** Ω using Value Editor. Re-simulate.',
        detail: 'I = 7.2/100 = 72 mA — dangerously high for a typical LED. Power in resistor = 72mA² × 100Ω = 518 mW!',
      },
      { text: 'Change the resistor back to **330** Ω (or higher) — safe operating point confirmed.' },
    ],
    successCriteria:
      'LED Vf = 1.8 V. Resistor limits I to 21.8 mA at 330 Ω. Reducing R to 100 Ω over-drives the LED (72 mA).',
    challenge:
      'A blue LED (Vf = 3.2 V) at 20 mA from 5 V: R = (5 − 3.2) / 0.020 = 90 Ω. Use 100 Ω (nearest standard). Build and verify.',
  },

  {
    id:         'zener-regulator',
    moduleId:   'semi',
    title:      'Zener Regulator',
    icon:       '◁⌇',
    duration:   '8 min',
    difficulty: 'intermediate',
    concept:    'Zener diodes clamp voltage at a precise level in reverse breakdown',
    theory:
      "A Zener diode operated in reverse breakdown maintains a nearly constant voltage Vz across its terminals. " +
      "A series resistor limits current: I = (V_in − Vz) / R. " +
      "This creates a simple shunt voltage reference. " +
      "Common Zener voltages: 3.3 V, 5.1 V, 6.2 V, 12 V — handy for low-current references and simple regulators.",
    steps: [
      { text: 'Place a **DC Source** **12 V** at **L+1** / **L-1**. Wire L+1 → a1.' },
      { text: 'Place **Resistor** 1 kΩ from **a1** → **a4**.' },
      {
        text:   'Open the **Semiconductor** tab. Select **Zener** ◁⌇. Set value to **5.1** Vz. Click **a4** → **a8**.',
        detail: 'The Zener\'s value field is Vz — the reverse breakdown voltage.',
      },
      { text: 'Place **Ground** from **a8** → **L-1**.' },
      { text: 'Click **▶ Simulate**. Check **Node Voltages**.' },
      {
        text:   'Midpoint (between R and Zener) should show ≈ **5.1 V**. The Zener clamps it there.',
        detail: 'Resistor: V_R = 12 − 5.1 = 6.9 V. I = 6.9/1000 = 6.9 mA. Zener must handle 6.9 mA.',
      },
      { text: 'Try changing the supply to **15 V**. Re-simulate — midpoint still ≈ 5.1 V. This is regulation!' },
    ],
    successCriteria:
      'Midpoint voltage ≈ 5.1 V regardless of supply changes (within limits). Resistor drops the remainder.',
    challenge:
      'Design a 3.3 V reference from 9 V with 5 mA through the Zener. R = (9 − 3.3)/0.005 = 1.14 kΩ → use 1.2 kΩ. Build it.',
  },

  {
    id:         'wheatstone-bridge',
    moduleId:   'semi',
    title:      'Wheatstone Bridge',
    icon:       '⬡',
    duration:   '12 min',
    difficulty: 'advanced',
    concept:    'A balanced bridge measures unknown resistance to high precision',
    theory:
      "A Wheatstone bridge has two voltage dividers in parallel sharing the same supply. " +
      "When R1/R2 = R3/R4, the bridge is balanced — the differential voltage between midpoints is zero. " +
      "Any imbalance produces a measurable voltage proportional to the resistance change. " +
      "Used in precision measurement: strain gauges, thermistors, load cells.",
    presetName: 'Wheatstone Bridge',
    steps: [
      { text: 'Load the **Wheatstone Bridge** preset. Click **▶ Simulate**.' },
      {
        text:   'Check **Node Voltages**. Find the two midpoint nodes — they should differ because the bridge is imbalanced.',
        detail: 'Left arm: R1=R2=1kΩ → Vmid_L = 9×1/2 = 4.5 V. Right arm: R3=1kΩ, R4=2.2kΩ → Vmid_R = 9×2.2/3.2 ≈ 6.19 V.',
      },
      { text: 'Calculate the differential: 6.19 − 4.5 = **1.69 V** imbalance.' },
      { text: 'Select **R4** (2.2 kΩ). Use Value Editor to change it to **1000** Ω.' },
      { text: 'Re-simulate. Check Node Voltages again — both midpoints should now show ≈ **4.5 V** (balanced!).' },
      { text: 'Differential ≈ **0 V** when R1/R2 = R3/R4 = 1 — the bridge is balanced.' },
      {
        text:   'Now change R4 to **1100** Ω (simulating a sensor under load). Re-simulate. Observe the new small differential.',
        detail: 'Vmid_R = 9 × 1100/2100 ≈ 4.71 V. Differential = 4.71 − 4.5 = 0.21 V — detectable by a precision amplifier.',
      },
    ],
    successCriteria:
      'Balanced: differential ≈ 0 V when all four arms equal. Any resistance change creates a proportional differential voltage.',
    challenge:
      'If R4 = 1000 Ω + ΔR (strain gauge), and a 1 mV change needs detecting, what amplifier gain is needed to read a 0.1 Ω change?',
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

export function getLessonsForModule(moduleId: string): Lesson[] {
  return LESSONS.filter(l => l.moduleId === moduleId)
}

export function getLessonById(id: string): Lesson | undefined {
  return LESSONS.find(l => l.id === id)
}
