export type MolCategory =
  | 'alkane' | 'alkene' | 'alkyne' | 'aromatic'
  | 'alcohol' | 'carbonyl' | 'acid' | 'amine'
  | 'amino-acid' | 'sugar' | 'natural'

export interface Molecule {
  name: string
  smiles: string
  category: MolCategory
  description: string
}

export const CATEGORY_LABELS: Record<MolCategory, string> = {
  'alkane':    'Alkanes',
  'alkene':    'Alkenes',
  'alkyne':    'Alkynes',
  'aromatic':  'Aromatics',
  'alcohol':   'Alcohols',
  'carbonyl':  'Aldehydes & Ketones',
  'acid':      'Carboxylic Acids',
  'amine':     'Amines',
  'amino-acid':'Amino Acids',
  'sugar':     'Sugars',
  'natural':   'Natural Products',
}

export const MOLECULES: Molecule[] = [
  // Alkanes
  { name: 'Methane',     smiles: 'C',          category: 'alkane',   description: 'Simplest hydrocarbon; primary component of natural gas' },
  { name: 'Ethane',      smiles: 'CC',         category: 'alkane',   description: 'Two-carbon alkane; free rotation about C–C bond' },
  { name: 'Propane',     smiles: 'CCC',        category: 'alkane',   description: 'LPG fuel; three carbons; first with conformational isomers' },
  { name: 'Butane',      smiles: 'CCCC',       category: 'alkane',   description: 'Lighter fuel; n-butane and isobutane are constitutional isomers' },
  { name: 'Cyclohexane', smiles: 'C1CCCCC1',   category: 'alkane',   description: 'Classic chair/boat conformational analysis; ring strain-free in chair' },
  { name: 'Cyclopentane',smiles: 'C1CCCC1',    category: 'alkane',   description: 'Puckered ring; component of steroids and prostaglandins' },

  // Alkenes
  { name: 'Ethylene',    smiles: 'C=C',        category: 'alkene',   description: 'Plant hormone; polyethylene monomer; planar sp² carbons' },
  { name: 'Propylene',   smiles: 'CC=C',       category: 'alkene',   description: 'Polypropylene monomer; Markovnikov addition applies' },
  { name: 'Isoprene',    smiles: 'C=CC(=C)C',  category: 'alkene',   description: 'Natural rubber monomer; conjugated diene for Diels-Alder' },
  { name: '1,3-Butadiene',smiles:'C=CC=C',     category: 'alkene',   description: 'Simplest conjugated diene; key in Diels-Alder reactions' },

  // Alkynes
  { name: 'Acetylene',   smiles: 'C#C',        category: 'alkyne',   description: 'sp hybridized; linear geometry; welding gas; terminal H acidic (pKa~25)' },
  { name: 'Propyne',     smiles: 'CC#C',       category: 'alkyne',   description: 'Terminal alkyne; deprotonatable by strong base' },

  // Aromatics
  { name: 'Benzene',     smiles: 'c1ccccc1',          category: 'aromatic', description: 'Prototypical aromatic; 6π electrons (Hückel 4n+2, n=1); planar' },
  { name: 'Toluene',     smiles: 'Cc1ccccc1',         category: 'aromatic', description: 'Methylbenzene; common solvent; methyl is ortho/para director' },
  { name: 'Naphthalene', smiles: 'c1ccc2ccccc2c1',    category: 'aromatic', description: 'Two fused benzene rings; 10π electrons; classic PAH' },
  { name: 'Anthracene',  smiles: 'c1ccc2cc3ccccc3cc2c1',category:'aromatic',description: 'Three linear fused rings; fluorescent; photochemistry substrate' },
  { name: 'Pyridine',    smiles: 'c1ccncc1',          category: 'aromatic', description: 'N-heterocycle; 6π; lone pair not aromatic; nucleophilic N' },
  { name: 'Phenol',      smiles: 'Oc1ccccc1',         category: 'aromatic', description: 'OH activates ring toward electrophiles; pKa~10 (more acidic than alcohol)' },
  { name: 'Aniline',     smiles: 'Nc1ccccc1',         category: 'aromatic', description: 'NH₂ strongly activates ring; weaker base than aliphatic amines' },

  // Alcohols
  { name: 'Methanol',    smiles: 'CO',         category: 'alcohol',  description: 'Wood alcohol; toxic (formic acid metabolite); primary' },
  { name: 'Ethanol',     smiles: 'CCO',        category: 'alcohol',  description: 'Drinking alcohol; fermentation product; common solvent' },
  { name: 'Isopropanol', smiles: 'CC(O)C',     category: 'alcohol',  description: 'Rubbing alcohol; secondary; oxidizes to acetone' },
  { name: 'Glycerol',    smiles: 'OCC(O)CO',   category: 'alcohol',  description: 'Triol; backbone of triglycerides; humectant' },

  // Aldehydes & Ketones
  { name: 'Formaldehyde',smiles: 'C=O',        category: 'carbonyl', description: 'Simplest aldehyde; toxic preservative; very reactive carbonyl' },
  { name: 'Acetaldehyde',smiles: 'CC=O',       category: 'carbonyl', description: 'Ethanol oxidation product; liver toxin; Strecker synthesis' },
  { name: 'Acetone',     smiles: 'CC(=O)C',    category: 'carbonyl', description: 'Simplest ketone; ketone body in fasting; universal solvent' },
  { name: 'Benzaldehyde',smiles: 'O=Cc1ccccc1',category: 'carbonyl', description: 'Almond scent; aromatic aldehyde; Cannizzaro reaction' },

  // Carboxylic acids
  { name: 'Formic Acid', smiles: 'OC=O',          category: 'acid', description: 'Ant venom; simplest carboxylic acid; pKa 3.75' },
  { name: 'Acetic Acid', smiles: 'CC(O)=O',        category: 'acid', description: 'Vinegar; acetyl donor (acetyl-CoA); pKa 4.76' },
  { name: 'Lactic Acid', smiles: 'C[C@@H](O)C(O)=O',category:'acid',description: 'Muscle metabolite; chiral centre; R/S stereochemistry' },
  { name: 'Benzoic Acid',smiles: 'OC(=O)c1ccccc1', category: 'acid', description: 'Food preservative (E210); resonance-stabilised carboxylate' },
  { name: 'Citric Acid', smiles: 'OC(CC(O)=O)(CC(O)=O)C(O)=O', category: 'acid', description: 'Tricarboxylic acid; Krebs cycle; citrus fruit sourness' },

  // Amines
  { name: 'Methylamine',    smiles: 'CN',       category: 'amine', description: 'Simplest primary amine; fishy odor; pKb ~3.4' },
  { name: 'Dimethylamine',  smiles: 'CNC',      category: 'amine', description: 'Secondary amine; herring-like smell' },
  { name: 'Trimethylamine', smiles: 'CN(C)C',   category: 'amine', description: 'Tertiary amine; trimethylaminuria (fish odor syndrome)' },

  // Amino acids
  { name: 'Glycine',       smiles: 'NCC(O)=O',                    category: 'amino-acid', description: 'Simplest; no chiral centre; achiral; inhibitory neurotransmitter' },
  { name: 'Alanine',       smiles: 'C[C@@H](N)C(O)=O',            category: 'amino-acid', description: 'Methyl side chain; nonpolar; L = S configuration' },
  { name: 'Phenylalanine', smiles: 'N[C@@H](Cc1ccccc1)C(O)=O',    category: 'amino-acid', description: 'Aromatic side chain; essential; PKU disease' },
  { name: 'Cysteine',      smiles: 'N[C@@H](CS)C(O)=O',           category: 'amino-acid', description: 'Thiol side chain; forms disulfide bridges; reactive –SH' },
  { name: 'Tryptophan',    smiles: 'N[C@@H](Cc1c[nH]c2ccccc12)C(O)=O', category: 'amino-acid', description: 'Indole side chain; serotonin precursor; essential' },

  // Sugars
  { name: 'Glucose',   smiles: 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O', category: 'sugar', description: 'Blood sugar; primary cellular fuel; α/β anomers' },
  { name: 'Fructose',  smiles: 'OC[C@@H]1OC(O)(CO)[C@@H](O)[C@@H]1O',    category: 'sugar', description: 'Fruit sugar; sweeter than glucose; ketose' },
  { name: 'Ribose',    smiles: 'OC[C@H]1OC(O)[C@H](O)[C@@H]1O',           category: 'sugar', description: 'Pentose; backbone of RNA; important in ATP/ADP' },

  // Natural products
  { name: 'Caffeine',     smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C',                     category: 'natural', description: 'Methylxanthine; adenosine receptor antagonist; coffee/tea' },
  { name: 'Aspirin',      smiles: 'CC(=O)Oc1ccccc1C(O)=O',                           category: 'natural', description: 'Acetylsalicylic acid; COX inhibitor; analgesic' },
  { name: 'Dopamine',     smiles: 'NCCc1ccc(O)c(O)c1',                               category: 'natural', description: 'Catecholamine neurotransmitter; reward and motor control' },
  { name: 'Adrenaline',   smiles: 'CNC[C@@H](O)c1ccc(O)c(O)c1',                      category: 'natural', description: 'Epinephrine; fight-or-flight hormone; adrenal medulla' },
  { name: 'Serotonin',    smiles: 'NCCc1c[nH]c2ccc(O)cc12',                          category: 'natural', description: 'Indole monoamine; mood, sleep, appetite; gut/brain' },
  { name: 'Cholesterol',  smiles: '[C@@H]1(CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C)[C@H](C)CCCC(C)C', category: 'natural', description: 'Steroid; membrane fluidity; hormone precursor' },
  { name: 'Penicillin G', smiles: 'CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)Cc3ccccc3)C(=O)O)C', category: 'natural', description: 'β-lactam antibiotic; inhibits cell wall synthesis' },
  { name: 'Testosterone', smiles: 'C[C@]12CC[C@H]3[C@@H](CC=C4C[C@@H](O)CC[C@]34C)[C@@H]1CCC2=O', category: 'natural', description: 'Androgen steroid; four fused rings; male hormone' },
  { name: 'Capsaicin',    smiles: 'COc1cc(CNC(=O)CCCC/C=C/C(C)C)ccc1O',             category: 'natural', description: 'Hot chili compound; TRPV1 receptor agonist' },
  { name: 'Resveratrol',  smiles: 'Oc1ccc(/C=C/c2cc(O)cc(O)c2)cc1',                 category: 'natural', description: 'Red wine polyphenol; stilbene; antioxidant research' },
]
