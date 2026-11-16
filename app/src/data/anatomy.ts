export type BodyRegion = 'head' | 'neck' | 'chest' | 'abdomen' | 'pelvis' | 'arm' | 'leg' | 'back'

export interface AnatomyNode {
  id:           string
  name:         string
  emoji?:       string
  color:        string        // hex
  priority:     1 | 2 | 3    // 1=Year1 must-know, 2=Year1-2, 3=advanced
  level:        'system' | 'organ' | 'structure' | 'microstructure'
  bodyRegions:  BodyRegion[]
  tagline:      string
  description:  string
  function?:    string
  clinicalPearl?: string
  pathologies?: string[]
  mnemonic?:    string
  children?:    AnatomyNode[]
}

// ── CARDIOVASCULAR ────────────────────────────────────────────────────────────
const cardiovascular: AnatomyNode = {
  id: 'cardiovascular', name: 'Cardiovascular System', emoji: '❤️',
  color: '#ef4444', priority: 1, level: 'system', bodyRegions: ['chest', 'abdomen', 'leg'],
  tagline: 'Closed-loop pump delivering O₂ and nutrients to every cell',
  description: 'The cardiovascular system consists of the heart (pump), arteries (high-pressure delivery), capillaries (exchange), and veins (low-pressure return). The heart beats ~100,000×/day, pumping ~5 L/min at rest.',
  function: 'Oxygen and nutrient delivery, CO₂ and waste removal, thermoregulation, immune cell transport, hormone distribution.',
  clinicalPearl: 'Coronary artery disease is the #1 cause of death worldwide. The LAD ("widow maker") supplies the anterior wall of the left ventricle — its occlusion causes anterior STEMI.',
  pathologies: ['Myocardial infarction (heart attack)', 'Heart failure (systolic vs diastolic)', 'Atrial fibrillation', 'Hypertension', 'Aortic stenosis', 'Deep vein thrombosis'],
  mnemonic: 'Right side = pulmonary (to lungs). Left side = systemic (to body). "Right is wrong" — deoxygenated blood on the right.',
  children: [
    {
      id: 'heart', name: 'Heart', emoji: '🫀',
      color: '#ef4444', priority: 1, level: 'organ', bodyRegions: ['chest'],
      tagline: 'Dual-sided muscular pump; ~300 g in adults',
      description: 'The heart sits in the mediastinum, slightly left of centre, within the pericardial sac. It has four chambers: two atria (receiving) and two ventricles (pumping). The left ventricle has the thickest wall (must pump against systemic pressure ~120 mmHg). The right ventricle pumps against pulmonary pressure ~25 mmHg.',
      function: 'Generates pressure to drive blood through pulmonary and systemic circulations. Cardiac output = heart rate × stroke volume (normal ~5 L/min).',
      clinicalPearl: 'The mitral valve is most commonly diseased. Aortic stenosis causes syncope, angina, and dyspnea — the triad predicts 2–3 year survival without surgery.',
      pathologies: ['Myocardial infarction', 'Cardiomyopathy (dilated, hypertrophic, restrictive)', 'Cardiac tamponade', 'Ventricular hypertrophy'],
      mnemonic: 'Flow: RA → tricuspid → RV → pulmonary valve → lungs → LA → mitral → LV → aortic valve → body. "Try Pulling My Aorta" (Tricuspid, Pulmonary, Mitral, Aortic).',
      children: [
        {
          id: 'right-atrium', name: 'Right Atrium', color: '#fca5a5', priority: 1, level: 'structure', bodyRegions: ['chest'],
          tagline: 'Receives deoxygenated blood from systemic veins',
          description: 'The right atrium (RA) receives deoxygenated blood from the superior vena cava (SVC), inferior vena cava (IVC), and coronary sinus. The SA node — the natural pacemaker — sits at the superior RA near the SVC junction. The interatrial septum contains the fossa ovalis, a remnant of the patent foramen ovale (PFO) from fetal circulation.',
          clinicalPearl: 'PFO (patent foramen ovale) persists in ~25% of adults and is a cause of cryptogenic stroke via paradoxical embolism.',
          pathologies: ['Atrial fibrillation (origin: pulmonary veins/RA)', 'Right atrial enlargement (cor pulmonale)', 'Atrial septal defect (ASD)'],
        },
        {
          id: 'right-ventricle', name: 'Right Ventricle', color: '#fca5a5', priority: 1, level: 'structure', bodyRegions: ['chest'],
          tagline: 'Pumps to pulmonary circulation; crescent-shaped cross-section',
          description: 'The right ventricle (RV) wraps around the left ventricle and has a crescent-shaped cross-section. Its wall is 3–5 mm thick (vs LV 8–15 mm) because pulmonary vascular resistance is much lower than systemic. The RV fails first in pulmonary hypertension.',
          clinicalPearl: 'Right heart failure (cor pulmonale) causes JVD, peripheral oedema, hepatomegaly — elevated JVP is the key bedside sign.',
          pathologies: ['Right heart failure', 'Pulmonary hypertension', 'Right ventricular infarction (RCA occlusion)'],
        },
        {
          id: 'left-atrium', name: 'Left Atrium', color: '#fca5a5', priority: 1, level: 'structure', bodyRegions: ['chest'],
          tagline: 'Receives oxygenated blood from four pulmonary veins',
          description: 'The left atrium (LA) is the most posterior cardiac chamber and receives four pulmonary veins (two from each lung). The LA appendage (LAA) is a finger-like pouch prone to clot formation in atrial fibrillation — the source of most AF-related strokes.',
          clinicalPearl: 'In atrial fibrillation, clots form in the LAA. Anticoagulation prevents stroke. LAA occlusion devices (Watchman) are used when anticoagulation is contraindicated.',
          pathologies: ['Left atrial enlargement (mitral stenosis)', 'LA thrombus → stroke', 'Atrial fibrillation'],
        },
        {
          id: 'left-ventricle', name: 'Left Ventricle', color: '#dc2626', priority: 1, level: 'structure', bodyRegions: ['chest'],
          tagline: 'The main pump; generates 120 mmHg systolic pressure',
          description: 'The left ventricle (LV) has a thick wall (8–15 mm) and ellipsoidal shape. It generates the systemic blood pressure. Ejection fraction (EF) = stroke volume / end-diastolic volume; normal EF >55%. EF <40% = systolic heart failure (HFrEF).',
          clinicalPearl: 'The LV is supplied primarily by the LAD (anterior wall, septum) and circumflex (lateral wall). The posterior wall is supplied by the PDA (from RCA in right-dominant hearts).',
          pathologies: ['Systolic heart failure (HFrEF)', 'LV hypertrophy (hypertension, AS)', 'Anterior STEMI (LAD occlusion)', 'Dilated cardiomyopathy'],
          mnemonic: 'HFrEF vs HFpEF: rEF = reduced EF (systolic failure — dilated), pEF = preserved EF (diastolic failure — stiff).',
        },
        {
          id: 'cardiac-valves', name: 'Cardiac Valves (×4)', color: '#b91c1c', priority: 1, level: 'structure', bodyRegions: ['chest'],
          tagline: 'One-way doors ensuring unidirectional flow',
          description: 'Four valves prevent backflow: two AV valves (atrioventricular) and two semilunar valves. AV valves open during diastole (filling); semilunar valves open during systole (ejection). All four valves lie in the same horizontal plane — the "cardiac skeleton".',
          clinicalPearl: 'Auscultation: Aortic (2nd R ICS), Pulmonary (2nd L ICS), Tricuspid (4th L ICS), Mitral (5th ICS mid-clavicular line). Mnemonic: "APT M" or "All Physicians Take Money".',
          pathologies: ['Mitral regurgitation (most common valvular disease)', 'Aortic stenosis (most common cause of valve replacement)', 'Mitral stenosis (rheumatic)', 'Bicuspid aortic valve (1% of population)'],
          mnemonic: 'Stenosis = narrowed valve, loud before opening. Regurgitation = leaky valve, murmur after closure. Systolic murmur: AS + MR. Diastolic: MS + AR.',
          children: [
            { id: 'mitral-valve', name: 'Mitral Valve (Bicuspid)', color: '#b91c1c', priority: 1, level: 'microstructure', bodyRegions: ['chest'], tagline: 'Left AV valve; 2 leaflets (anterior + posterior)', description: 'The mitral valve sits between the LA and LV. It has two leaflets (anterior/posterior) supported by chordae tendineae attached to papillary muscles. "Mitral" refers to its resemblance to a bishop\'s mitre.', clinicalPearl: 'MVP (mitral valve prolapse) is the most common valvular abnormality (2–3% prevalence). Mitral regurgitation produces a holosystolic murmur at the apex radiating to the axilla.', pathologies: ['Mitral regurgitation', 'Mitral stenosis (rheumatic fever)', 'MVP (myxomatous degeneration)'] },
            { id: 'aortic-valve', name: 'Aortic Valve (Semilunar)', color: '#b91c1c', priority: 1, level: 'microstructure', bodyRegions: ['chest'], tagline: 'Outflow valve of the left ventricle; 3 cusps', description: 'The aortic valve has three cusps (left, right, posterior). The coronary ostia arise just above the left and right cusps. A bicuspid aortic valve (congenital, 1%) accelerates stenosis.', clinicalPearl: 'Aortic stenosis produces a harsh crescendo-decrescendo systolic murmur at the right upper sternal border radiating to the carotids. Classic triad: syncope, angina, dyspnea = 2–5 years to death without replacement.', pathologies: ['Aortic stenosis', 'Aortic regurgitation', 'Bicuspid aortic valve'] },
            { id: 'tricuspid-valve', name: 'Tricuspid Valve', color: '#b91c1c', priority: 1, level: 'microstructure', bodyRegions: ['chest'], tagline: 'Right AV valve; 3 leaflets', description: 'The tricuspid valve has three leaflets (anterior, posterior, septal). It is the largest cardiac valve by area. Tricuspid regurgitation is usually functional (RV dilation) rather than primary valve disease.', clinicalPearl: 'Tricuspid endocarditis is seen in IV drug users (right-sided — septic emboli to lungs, not brain).', pathologies: ['Tricuspid regurgitation (functional)', 'Ebstein anomaly (congenital — apical displacement)', 'Endocarditis (IVDU)'] },
            { id: 'pulmonary-valve', name: 'Pulmonary Valve (Semilunar)', color: '#b91c1c', priority: 1, level: 'microstructure', bodyRegions: ['chest'], tagline: 'Outflow valve of the right ventricle; 3 cusps', description: 'The pulmonary valve guards the outflow of the RV into the pulmonary trunk. It is the least commonly diseased valve. Pulmonary stenosis is a feature of Noonan syndrome and congenital rubella.', clinicalPearl: 'Pulmonary stenosis causes a systolic murmur that increases with inspiration (Carvallo sign — right-sided murmurs louder on inspiration due to increased venous return).', pathologies: ['Pulmonary stenosis (congenital)', 'Carcinoid syndrome (right-sided valve thickening)'] },
          ],
        },
        {
          id: 'conduction', name: 'Conduction System', color: '#f97316', priority: 1, level: 'structure', bodyRegions: ['chest'],
          tagline: 'Electrical wiring that coordinates cardiac contraction',
          description: 'The conduction system generates and propagates electrical impulses in a precise sequence: SA node (pacemaker) → internodal tracts → AV node (gatekeeper, 0.1s delay) → Bundle of His → left + right bundle branches → Purkinje fibres → ventricular myocardium. Normal rate: 60–100 bpm.',
          clinicalPearl: 'The AV node delay allows atrial contraction to complete (the "atrial kick" adds 20–30% to stroke volume) before ventricular contraction. This is lost in AF — important in patients with poor LV function.',
          pathologies: ['Atrial fibrillation (chaotic atrial firing)', 'Heart block (1°/2°/3° — AV node disease)', 'Bundle branch block', 'WPW syndrome (accessory pathway)'],
          mnemonic: 'SA → AV → Bundle of His → Bundle Branches → Purkinje. "Sally Always Brings Her Puppies" (SA, AV, Bundle His, branches, Purkinje).',
          children: [
            { id: 'sa-node', name: 'SA Node (Sinoatrial)', color: '#f97316', priority: 1, level: 'microstructure', bodyRegions: ['chest'], tagline: 'Natural pacemaker; 60–100 bpm intrinsic rate', description: 'Located at the junction of the SVC and right atrium. Spontaneously depolarises at 60–100 bpm. Supplied by the SA nodal artery (from RCA in 60%, circumflex in 40%).', clinicalPearl: 'Sick sinus syndrome (SSS) = SA node dysfunction causing bradycardia, pause, or tachycardia-bradycardia. Treated with a permanent pacemaker.', pathologies: ['Sick sinus syndrome', 'SA block'] },
            { id: 'av-node', name: 'AV Node (Atrioventricular)', color: '#f97316', priority: 1, level: 'microstructure', bodyRegions: ['chest'], tagline: 'Gatekeeper; only electrical connection between atria and ventricles; intrinsic 40–60 bpm', description: 'Located in the triangle of Koch (right atrium, near the coronary sinus os). Delays impulse by 0.1s (PR interval). Supplied by the AV nodal artery from the RCA (90%) — posterior MI can cause AV block.', clinicalPearl: '2° AV block Mobitz II and 3° (complete) heart block require urgent pacing. Mobitz I (Wenckebach) is usually benign and seen in athletes.', pathologies: ['First degree AV block', 'Second degree AV block (Mobitz I/II)', 'Third degree (complete) AV block'] },
            { id: 'purkinje', name: 'Purkinje Fibres', color: '#f97316', priority: 1, level: 'microstructure', bodyRegions: ['chest'], tagline: 'Final rapid-conduction network; 15–40 bpm intrinsic', description: 'Modified cardiomyocytes that rapidly conduct impulses to the ventricular myocardium. They spread the electrical signal from endocardium to epicardium, ensuring near-simultaneous ventricular contraction.', clinicalPearl: 'Bundle branch block (BBB) — delayed conduction through one bundle branch — produces a wide QRS (>120 ms). LBBB almost always pathological; RBBB can be normal.', pathologies: ['Left bundle branch block (LBBB)', 'Right bundle branch block (RBBB)', 'Fascicular block (hemiblock)'] },
          ],
        },
        {
          id: 'coronary', name: 'Coronary Circulation', color: '#dc2626', priority: 1, level: 'organ', bodyRegions: ['chest'],
          tagline: 'Blood supply to the myocardium itself',
          description: 'The coronary arteries arise from the aortic sinuses just above the aortic valve. They fill during diastole (when the myocardium relaxes and stops compressing them). 90% of people are "right dominant" — the right coronary artery (RCA) gives rise to the posterior descending artery (PDA).',
          clinicalPearl: 'The LAD is the most commonly occluded coronary artery. LAD occlusion → anterior STEMI. RCA occlusion → inferior STEMI + possible AV block. Circumflex → lateral STEMI.',
          pathologies: ['ST-elevation MI (STEMI)', 'Non-ST-elevation MI (NSTEMI)', 'Unstable angina', 'Stable angina (demand ischaemia)'],
          mnemonic: 'LAD → Anterior wall + septum. Circumflex → Lateral wall. RCA → Inferior wall + SA/AV nodes. "LAD keeps the lights on up front."',
          children: [
            { id: 'lad', name: 'Left Anterior Descending (LAD)', color: '#dc2626', priority: 1, level: 'structure', bodyRegions: ['chest'], tagline: '"Widow maker" — supplies anterior LV and septum', description: 'The LAD runs in the anterior interventricular groove. It supplies the anterior two-thirds of the interventricular septum, the anterior wall of the LV, and the apex. Diagonal branches supply the anterolateral LV wall.', clinicalPearl: 'LAD occlusion = anterior STEMI with ST elevation in V1–V4. New LBBB with chest pain = treat as STEMI.', pathologies: ['Anterior STEMI', 'Anterior wall aneurysm'] },
            { id: 'rca', name: 'Right Coronary Artery (RCA)', color: '#dc2626', priority: 1, level: 'structure', bodyRegions: ['chest'], tagline: 'Supplies RV, inferior LV, SA + AV nodes (in most)', description: 'The RCA runs in the right AV groove. In 90% of people it gives rise to the PDA (right dominant). It supplies the SA node in 60% and the AV node in 90% of people.', clinicalPearl: 'Inferior STEMI (ST elevation II, III, aVF) = RCA occlusion. Always check right-sided leads (V4R) — 30% have concomitant RV infarction. Avoid nitrates + give fluids in RV MI.', pathologies: ['Inferior STEMI', 'AV nodal block (with inferior MI)'] },
            { id: 'lcx', name: 'Left Circumflex (LCx)', color: '#dc2626', priority: 1, level: 'structure', bodyRegions: ['chest'], tagline: 'Supplies lateral wall of the LV via obtuse marginals', description: 'The LCx runs in the left AV groove. It gives off obtuse marginal (OM) branches that supply the lateral LV wall. In left-dominant patients (~10%), the LCx gives rise to the PDA.', clinicalPearl: 'Lateral STEMI (ST elevation I, aVL, V5–V6) from LCx occlusion. Posterior MI may show only ST depression in V1–V2 (reciprocal changes) — use posterior leads V7–V9.', pathologies: ['Lateral STEMI', 'Posterior MI (posterior leads required)'] },
          ],
        },
      ],
    },
  ],
}

// ── RESPIRATORY ───────────────────────────────────────────────────────────────
const respiratory: AnatomyNode = {
  id: 'respiratory', name: 'Respiratory System', emoji: '🫁',
  color: '#3b82f6', priority: 1, level: 'system', bodyRegions: ['head', 'neck', 'chest'],
  tagline: 'Gas exchange: O₂ in, CO₂ out — ~12–20 breaths/min',
  description: 'The respiratory system conducts air from the environment to the alveoli, where O₂ diffuses into blood and CO₂ diffuses out. The conducting zone (nose to terminal bronchioles) has no gas exchange. The respiratory zone (respiratory bronchioles + alveoli) is where exchange occurs.',
  clinicalPearl: 'Ventilation (V) and perfusion (Q) must match. V/Q ratio: apex ~3 (over-ventilated), base ~0.6 (over-perfused). PE raises V/Q (dead space); pneumonia lowers V/Q (shunt).',
  pathologies: ['COPD (emphysema + chronic bronchitis)', 'Asthma', 'Pneumonia', 'Pulmonary embolism', 'Lung cancer', 'Pleural effusion', 'Pneumothorax'],
  mnemonic: 'Bronchial tree order: Trachea → Main bronchi → Lobar → Segmental → Subsegmental → Bronchioles → Terminal bronchioles → Respiratory bronchioles → Alveolar ducts → Alveoli.',
  children: [
    {
      id: 'upper-airway', name: 'Upper Airways', color: '#60a5fa', priority: 1, level: 'organ', bodyRegions: ['head', 'neck'],
      tagline: 'Warms, humidifies, and filters air; phonation',
      description: 'The upper airway includes the nasal cavity (filters, warms, humidifies), pharynx (nasopharynx, oropharynx, laryngopharynx), and larynx (voice box; protects airway during swallowing). The larynx contains the vocal cords (true cords = glottis).',
      clinicalPearl: 'Epiglottitis (H. influenzae in children, adults too) = medical emergency — "tripod position", muffled voice, drooling, high fever. Never examine the throat — can trigger complete obstruction.',
      pathologies: ['Epiglottitis', 'Croup (laryngotracheobronchitis — barking cough)', 'OSA (obstructive sleep apnea)', 'Vocal cord paralysis (recurrent laryngeal nerve damage)'],
      children: [
        { id: 'larynx', name: 'Larynx', color: '#60a5fa', priority: 1, level: 'structure', bodyRegions: ['neck'], tagline: 'Voice box; epiglottis protects airway during swallowing', description: 'The larynx is a cartilaginous structure (thyroid cartilage = "Adam\'s apple", cricoid cartilage below). The epiglottis folds over the glottis during swallowing. The recurrent laryngeal nerve (branch of CN X) supplies all intrinsic laryngeal muscles except cricothyroid.', clinicalPearl: 'Left RLN loops under the aortic arch — vulnerable to mediastinal masses, aortic aneurysm, lung cancer. Unilateral palsy = hoarseness. Bilateral = stridor, respiratory distress.', pathologies: ['RLN palsy (post-thyroidectomy, lung cancer)', 'Epiglottitis', 'Laryngeal cancer'] },
      ],
    },
    {
      id: 'lungs', name: 'Lungs', color: '#3b82f6', priority: 1, level: 'organ', bodyRegions: ['chest'],
      tagline: 'Right: 3 lobes; Left: 2 lobes (cardiac notch)',
      description: 'The right lung has three lobes (upper, middle, lower) separated by the oblique and horizontal fissures. The left lung has two lobes (upper, lower) with a cardiac notch accommodating the heart. The left upper lobe has a lingula (homologue of the right middle lobe). The right main bronchus is wider, shorter, and more vertical — aspirated objects go right.',
      clinicalPearl: 'Aspiration pneumonia typically involves the right lower lobe (when upright) or right upper lobe posterior segment (when supine). The right bronchus is more vertical.',
      pathologies: ['Pneumonia (lobar, broncho-)', 'Lung cancer (adeno = peripheral, squamous = central, SCLC = hilar)', 'COPD', 'Pneumothorax', 'Atelectasis'],
      children: [
        { id: 'alveolus', name: 'Alveolus', color: '#2563eb', priority: 1, level: 'structure', bodyRegions: ['chest'], tagline: 'Gas exchange unit; 300 million in each lung; surface area ~70 m²', description: 'Alveoli are thin-walled air sacs lined by Type I pneumocytes (gas exchange, 95% of surface area) and Type II pneumocytes (produce surfactant, regenerate after injury). Pores of Kohn allow collateral ventilation between alveoli. Alveolar macrophages clear debris.', clinicalPearl: 'Surfactant (dipalmitoylphosphatidylcholine — DPPC) reduces surface tension, preventing alveolar collapse. Absent in premature infants → neonatal RDS. Treated with exogenous surfactant.', pathologies: ['ARDS (diffuse alveolar damage)', 'Neonatal RDS (surfactant deficiency)', 'Pneumonia', 'Pulmonary fibrosis (alveolar wall thickening)', 'Pulmonary oedema'] },
        { id: 'pleura', name: 'Pleura', color: '#1d4ed8', priority: 1, level: 'structure', bodyRegions: ['chest'], tagline: 'Two-layer serosal membrane; ~15 mL lubricating fluid', description: 'Visceral pleura (covers lung surface, no pain fibres) and parietal pleura (lines chest wall, has pain fibres — pleuritic pain). The pleural cavity normally has 10–15 mL of fluid. Negative intrapleural pressure keeps lungs expanded.', clinicalPearl: 'Pleuritis (pleurisy) = sharp, positional chest pain, worse with inspiration. Pleural friction rub on auscultation. Causes: PE, pneumonia, viral, lupus, RA.', pathologies: ['Pleural effusion (transudate vs exudate — Light\'s criteria)', 'Pneumothorax', 'Haemothorax', 'Mesothelioma (asbestos)'] },
      ],
    },
  ],
}

// ── NERVOUS SYSTEM ────────────────────────────────────────────────────────────
const nervous: AnatomyNode = {
  id: 'nervous', name: 'Nervous System', emoji: '🧠',
  color: '#8b5cf6', priority: 1, level: 'system', bodyRegions: ['head', 'back', 'leg', 'arm'],
  tagline: 'Command and communication network — CNS + PNS',
  description: 'The nervous system is divided into the central nervous system (CNS: brain + spinal cord) and peripheral nervous system (PNS: cranial nerves, spinal nerves, autonomic nervous system). The brain receives 20% of cardiac output despite being 2% of body weight.',
  clinicalPearl: 'Upper vs lower motor neuron lesions: UMN (spastic, hyperreflexia, upgoing Babinski, no wasting) vs LMN (flaccid, hyporeflexia, downgoing Babinski, wasting, fasciculations).',
  pathologies: ['Stroke (ischaemic 85%, haemorrhagic 15%)', 'Epilepsy', 'Parkinson disease', 'Alzheimer dementia', 'Multiple sclerosis', 'Meningitis', 'Brain tumours'],
  mnemonic: 'Cranial nerves: "Oh Oh Oh To Touch And Feel Very Good Velvet — Ah Heaven!" (CN I–XII).',
  children: [
    {
      id: 'brain', name: 'Brain (Encephalon)', color: '#8b5cf6', priority: 1, level: 'organ', bodyRegions: ['head'],
      tagline: '~1400 g; 86 billion neurons; consumes 20% of body O₂',
      description: 'The brain is protected by the skull, meninges (dura, arachnoid, pia mater), and blood-brain barrier. Major divisions: cerebrum (higher functions), diencephalon (thalamus/hypothalamus), brainstem (midbrain/pons/medulla — vital functions), cerebellum (coordination).',
      clinicalPearl: 'Herniation syndromes: Uncal herniation (CN III palsy → "blown pupil" — ipsilateral fixed dilated pupil + contralateral hemiplegia). Tonsillar herniation (Cushing\'s triad: hypertension, bradycardia, irregular breathing = impending brainstem death).',
      pathologies: ['Stroke', 'TIA', 'Subdural haematoma', 'Epidural haematoma', 'Subarachnoid haemorrhage (thunderclap headache)', 'Brain abscess', 'Meningitis/encephalitis'],
      children: [
        {
          id: 'cerebrum', name: 'Cerebrum (Cerebral Cortex)', color: '#7c3aed', priority: 1, level: 'structure', bodyRegions: ['head'],
          tagline: 'Four lobes; higher cognitive functions, sensation, motor control',
          description: 'The cerebrum is divided into left and right hemispheres by the longitudinal fissure. The cortex has 6 layers of grey matter. Key sulci: central sulcus (separates frontal from parietal), lateral sulcus (frontal/parietal from temporal).',
          clinicalPearl: 'Dominant hemisphere (left in ~95%): language (Broca\'s = motor, Wernicke\'s = comprehension). Non-dominant: spatial awareness, prosody. Parietal lesions: neglect, apraxia.',
          pathologies: ['Stroke (MCA = arm > leg; ACA = leg > arm)', 'Cortical dementia (Alzheimer — starts temporal/parietal)', 'Tumours (glioblastoma = most aggressive primary)'],
          children: [
            { id: 'frontal-lobe', name: 'Frontal Lobe', color: '#6d28d9', priority: 1, level: 'microstructure', bodyRegions: ['head'], tagline: 'Motor cortex, executive function, personality, Broca\'s area', description: 'The frontal lobe contains the primary motor cortex (precentral gyrus), premotor cortex, and prefrontal cortex (personality, judgment, executive function). Broca\'s area (inferior frontal gyrus, dominant hemisphere) = motor speech production.', clinicalPearl: 'Frontal lobe lesions: disinhibition, personality change, perseveration, primitive reflexes (grasp, snout). Broca\'s aphasia = non-fluent speech, intact comprehension — patient frustrated.', pathologies: ['Broca\'s aphasia', 'Personality change (trauma, tumour, Pick disease)', 'Frontal lobe epilepsy'] },
            { id: 'parietal-lobe', name: 'Parietal Lobe', color: '#6d28d9', priority: 1, level: 'microstructure', bodyRegions: ['head'], tagline: 'Somatosensory cortex, spatial processing, language', description: 'The parietal lobe contains the primary somatosensory cortex (postcentral gyrus) receiving touch/proprioception/pain/temperature from the contralateral body. Wernicke\'s area straddles the parietal-temporal junction.', clinicalPearl: 'Gerstmann syndrome (dominant parietal): acalculia, agraphia, finger agnosia, left-right confusion — caused by lesion at angular gyrus. Non-dominant parietal lesion → hemispatial neglect.', pathologies: ['Hemispatial neglect', 'Astereognosis', 'Sensory extinction', 'Gerstmann syndrome'] },
            { id: 'temporal-lobe', name: 'Temporal Lobe', color: '#6d28d9', priority: 1, level: 'microstructure', bodyRegions: ['head'], tagline: 'Auditory cortex, memory (hippocampus), Wernicke\'s area', description: 'The temporal lobe contains the primary auditory cortex (Heschl\'s gyri), Wernicke\'s area (posterior superior temporal gyrus), and the hippocampus + amygdala (mesial temporal lobe). Crucially involved in memory formation and emotion.', clinicalPearl: 'Temporal lobe epilepsy = most common focal epilepsy. Auras: déjà vu, jamais vu, olfactory hallucinations, emotional changes. Bilateral hippocampal damage → anterograde amnesia (can\'t form new memories — Henry Molaison, "H.M.").', pathologies: ['Temporal lobe epilepsy', 'Wernicke\'s aphasia', 'Amnesia (hippocampal damage)', 'Herpes encephalitis (temporal lobe tropism)'] },
            { id: 'occipital-lobe', name: 'Occipital Lobe', color: '#6d28d9', priority: 1, level: 'microstructure', bodyRegions: ['head'], tagline: 'Primary visual cortex (V1); calcarine sulcus', description: 'The occipital lobe is entirely dedicated to visual processing. The primary visual cortex (V1) lies in the calcarine sulcus. The upper visual field projects to the lower bank; lower field to upper bank. "What" pathway (ventral): object recognition. "Where" pathway (dorsal): spatial processing.', clinicalPearl: 'Posterior cerebral artery (PCA) stroke → contralateral homonymous hemianopia with macular sparing (macula has dual blood supply from MCA). Visual agnosia (can see but can\'t recognise objects).', pathologies: ['Homonymous hemianopia (PCA stroke)', 'Cortical blindness (bilateral occipital)', 'Visual agnosia', 'Charles Bonnet syndrome (visual hallucinations with vision loss)'] },
          ],
        },
        { id: 'brainstem', name: 'Brainstem', color: '#7c3aed', priority: 1, level: 'structure', bodyRegions: ['head'], tagline: 'Midbrain + Pons + Medulla; vital functions — "can\'t live without it"', description: 'The brainstem connects the cerebrum to the spinal cord and contains the nuclei for CN III–XII, the reticular activating system (consciousness), and vital centres for respiration, cardiovascular control, and vomiting. The medulla contains the respiratory rhythm generator.', clinicalPearl: 'Lateral medullary syndrome (Wallenberg) = PICA occlusion: ipsilateral face loss + contralateral body loss (crossed sensory loss), dysphagia, hoarseness, Horner syndrome, nystagmus, ataxia.', pathologies: ['Lateral medullary syndrome (Wallenberg)', 'Locked-in syndrome (basilar artery occlusion)', 'Pontine haemorrhage (pinpoint pupils)', 'Central apnea'], mnemonic: '"Don\'t Ever Give Violent People Clonazepam Heavily"= CN nuclei in brainstem: DIII, DIV (midbrain), DNV (pons), DVII–VIII (pons), DIX–XII (medulla). ' },
        { id: 'cerebellum', name: 'Cerebellum', color: '#7c3aed', priority: 1, level: 'structure', bodyRegions: ['head'], tagline: 'Coordination and balance; 50% of all brain neurons', description: 'The cerebellum coordinates smooth voluntary movement, balance, and motor learning. It has three main regions: vermis (midline — truncal/gait), hemisphere (lateral — limb coordination). Key output: dentate nucleus → thalamus → motor cortex. Lesions cause ipsilateral deficits (uncrossed pathway to thalamus).', clinicalPearl: 'Cerebellar lesions: DANISH = Dysdiadochokinesia, Ataxia, Nystagmus, Intention tremor, Slurred speech (dysarthria), Hypotonia. Vermis lesions → truncal ataxia (alcoholic cerebellar degeneration).', pathologies: ['Cerebellar stroke (PICA, AICA)', 'Alcoholic cerebellar degeneration', 'Multiple sclerosis plaques', 'Medulloblastoma (vermis, children)', 'Paraneoplastic cerebellar degeneration'] },
      ],
    },
    {
      id: 'spinal-cord', name: 'Spinal Cord', color: '#6d28d9', priority: 1, level: 'organ', bodyRegions: ['back'],
      tagline: '45 cm long; ends at L1–L2 (conus medullaris)',
      description: 'The spinal cord extends from the foramen magnum to L1–L2 (conus medullaris). Below that, nerve roots form the cauda equina. Grey matter (butterfly pattern): dorsal horn (sensory), ventral horn (motor), lateral horn (T1-L2: sympathetic; S2-4: parasympathetic). White matter: ascending (sensory) and descending (motor) tracts.',
      clinicalPearl: 'Spinal cord injury levels: C3–C5 = phrenic nerve (diaphragm — "C3, 4, 5 keeps the diaphragm alive"). C5–C6 = biceps. L3–L4 = quadriceps. S1–S2 = ankle jerk.',
      pathologies: ['Spinal cord compression (tumour, disc, abscess)', 'Brown-Séquard syndrome (hemisection)', 'Central cord syndrome (hyperextension)', 'Syringomyelia', 'ALS', 'B12 deficiency (subacute combined degeneration)'],
      mnemonic: 'Major tracts: Dorsal columns (ipsilateral fine touch/proprioception — decussate at medulla). Spinothalamic (contralateral pain/temp — decussate at spinal cord level). Corticospinal (motor — decussate at medulla).',
    },
  ],
}

// ── DIGESTIVE SYSTEM ──────────────────────────────────────────────────────────
const digestive: AnatomyNode = {
  id: 'digestive', name: 'Digestive System', emoji: '🫃',
  color: '#16a34a', priority: 2, level: 'system', bodyRegions: ['neck', 'chest', 'abdomen', 'pelvis'],
  tagline: 'Ingestion → digestion → absorption → elimination',
  description: 'The gastrointestinal tract is a ~9 m muscular tube from mouth to anus. Accessory organs (liver, gallbladder, pancreas) secrete enzymes and bile into the duodenum. The enteric nervous system ("gut brain") has 100 million neurons — can function independently of the CNS.',
  clinicalPearl: 'The hepatic portal system drains gut blood to the liver before systemic circulation — first-pass metabolism of orally ingested drugs. Portosystemic anastomoses become important in portal hypertension (oesophageal varices, caput medusae, haemorrhoids).',
  pathologies: ['GERD', 'Peptic ulcer disease', 'Appendicitis', 'IBD (Crohn\'s + UC)', 'Colorectal cancer', 'Cirrhosis', 'Acute pancreatitis', 'Cholecystitis'],
  children: [
    { id: 'stomach', name: 'Stomach', color: '#15803d', priority: 2, level: 'organ', bodyRegions: ['abdomen'], tagline: 'J-shaped reservoir; HCl production; pepsin; intrinsic factor', description: 'The stomach has four regions: cardia, fundus, body, pylorus/antrum. The mucosa contains parietal cells (HCl + intrinsic factor), chief cells (pepsinogen), and G cells (gastrin — in antrum). HCl creates pH 1–2, activates pepsinogen to pepsin, kills pathogens.', clinicalPearl: 'Intrinsic factor (IF) from parietal cells is required for B12 absorption in the terminal ileum. Pernicious anaemia = autoimmune destruction of parietal cells → IF deficiency → B12 deficiency → megaloblastic anaemia + subacute combined degeneration.', pathologies: ['Peptic ulcer disease (H. pylori 90%)', 'Gastric cancer', 'Pernicious anaemia', 'GERD (LES incompetence)'], mnemonic: 'Antrum G cells secrete Gastrin → stimulates parietal cells → HCl. Vagus nerve (CN X) stimulates all. Somatostatin from D cells INHIBITS all. "D cells Dampen secretion."' },
    { id: 'small-intestine', name: 'Small Intestine', color: '#15803d', priority: 2, level: 'organ', bodyRegions: ['abdomen'], tagline: 'Duodenum (25cm) → Jejunum (2m) → Ileum (3m); absorption powerhouse', description: 'The small intestine is the primary site of nutrient absorption. Villi and microvilli increase surface area ~600-fold (to ~200 m²). Duodenum: receives bile + pancreatic juice, absorbs Fe²⁺ and folate. Jejunum: most absorption (fats, carbs, protein, vitamins). Ileum: B12-IF complex, bile salts (enterohepatic circulation), fat-soluble vitamins.', clinicalPearl: 'Ileum is the only site for B12 absorption and bile salt reclamation. Terminal ileal disease (Crohn\'s) or resection → B12 deficiency + fat malabsorption (bile salts not recycled).', pathologies: ['Celiac disease (gluten sensitivity — proximal SI)', 'Crohn\'s disease (transmural, skip lesions)', 'Small bowel obstruction', 'Meckel\'s diverticulum (remnant of vitelline duct)'], mnemonic: '"Faithful Absorbed in the Ileum": Fat-soluble vitamins, B12-IF complex, Bile salts, Ileum (terminal).' },
    { id: 'liver', name: 'Liver', color: '#166534', priority: 2, level: 'organ', bodyRegions: ['abdomen'], tagline: '1.5 kg; >500 metabolic functions; only organ that regenerates', description: 'The liver is the largest solid organ, located in the right upper quadrant. It has four lobes (right, left, caudate, quadrate) and dual blood supply: portal vein (75%, nutrient-rich) + hepatic artery (25%, oxygenated). The functional unit is the hepatic lobule. The liver detoxifies, synthesises proteins (albumin, clotting factors), conjugates bilirubin, and stores glycogen.', clinicalPearl: 'Liver failure: bilirubin up (jaundice), albumin down (oedema/ascites), clotting factors down (elevated PT/INR), ammonia up (hepatic encephalopathy). Child-Pugh/MELD scores predict mortality.', pathologies: ['Cirrhosis (fibrosis → portal hypertension)', 'Hepatocellular carcinoma (HBV, HCV, alcohol, NASH)', 'Viral hepatitis (A–E)', 'Alcoholic liver disease', 'NAFLD/NASH', 'Liver failure'], mnemonic: 'Hepatocytes in zone 1 (periportal): "1st to be Fed" — first to receive O₂ and nutrients. Zone 3 (centrilobular): "3rd to die" — most vulnerable to ischaemia and toxic injury (acetaminophen/paracetamol).' },
    { id: 'pancreas', name: 'Pancreas', color: '#166534', priority: 2, level: 'organ', bodyRegions: ['abdomen'], tagline: 'Exocrine (enzymes) + endocrine (insulin/glucagon)', description: 'The pancreas has head (nestled in duodenal C-loop), body, and tail (touching spleen). Exocrine: acinar cells secrete digestive enzymes (amylase, lipase, proteases) into the duodenum via the pancreatic duct. Endocrine: Islets of Langerhans — β cells (insulin), α cells (glucagon), δ cells (somatostatin), PP cells (pancreatic polypeptide).', clinicalPearl: 'Acute pancreatitis: activated enzymes digest the pancreas itself. Causes: Gallstones (obstructs ampulla) and alcohol (most common in western populations). Cullen\'s sign (periumbilical bruising) + Grey Turner\'s sign (flank bruising) = retroperitoneal haemorrhage.', pathologies: ['Acute pancreatitis (gallstones, alcohol)', 'Chronic pancreatitis (steatorrhoea, diabetes, pain)', 'Pancreatic adenocarcinoma (poor prognosis, head = obstructive jaundice)', 'Insulinoma (β cell tumour — hypoglycaemia)'], mnemonic: 'Islets of Langerhans: α = Above (A for Alpha, Glucagon raises blood sugar). β = Below (Beta, insulin lowers). δ = in between (somatostatin, inhibits both).' },
  ],
}

// ── URINARY SYSTEM ────────────────────────────────────────────────────────────
const urinary: AnatomyNode = {
  id: 'urinary', name: 'Urinary System', emoji: '🫘',
  color: '#0891b2', priority: 2, level: 'system', bodyRegions: ['abdomen', 'pelvis'],
  tagline: 'Fluid/electrolyte balance, waste excretion, BP regulation',
  description: 'Two kidneys filter ~180 L of plasma/day, producing ~1.5 L urine. The kidneys regulate water, electrolytes, acid-base balance, and blood pressure (RAAS). They also produce erythropoietin (EPO) and activate vitamin D.',
  clinicalPearl: 'Kidney stones: calcium oxalate (most common, 80%), uric acid (radiolucent on plain X-ray), struvite (infection — staghorn calculi), cystine. "Calcium Oxalate Stones Usually Cause Kidney pain" — COxalate, Uric acid, Struvite, Cystine.',
  pathologies: ['Acute kidney injury (AKI)', 'Chronic kidney disease (CKD)', 'Nephrotic syndrome (massive proteinuria)', 'Nephritic syndrome (haematuria, hypertension, mild proteinuria)', 'Renal cell carcinoma', 'Urinary tract infection', 'Renal artery stenosis (renovascular HTN)'],
  children: [
    {
      id: 'kidney', name: 'Kidney', color: '#0e7490', priority: 2, level: 'organ', bodyRegions: ['abdomen'],
      tagline: '11 cm × 6 cm × 3 cm; retroperitoneal; right is lower (liver)',
      description: 'Bean-shaped retroperitoneal organs. The renal cortex (outer) contains glomeruli and convoluted tubules. The medulla (inner) contains loops of Henle and collecting ducts. The renal pelvis collects urine → ureter. Blood: renal artery → segmental → interlobar → arcuate → interlobular → afferent arteriole → glomerulus → efferent arteriole → peritubular capillaries.',
      clinicalPearl: 'Renal cell carcinoma (RCC) classic triad: haematuria, flank pain, palpable mass. Only 10% present with all three. RCC is the great imitator — paraneoplastic: polycythaemia (EPO), hypercalcaemia (PTHrP), Stauffer syndrome (abnormal LFTs without metastases).',
      pathologies: ['Renal cell carcinoma', 'Renal stones (nephrolithiasis)', 'Glomerulonephritis', 'Polycystic kidney disease', 'Hydronephrosis'],
      children: [
        {
          id: 'nephron', name: 'Nephron', color: '#164e63', priority: 2, level: 'structure', bodyRegions: ['abdomen'],
          tagline: 'Functional unit of the kidney; ~1 million per kidney',
          description: 'Each nephron consists of the renal corpuscle (glomerulus + Bowman\'s capsule) and a tubular system. Filtration occurs at the glomerulus. Selective reabsorption and secretion occur in the tubules to produce final urine.',
          clinicalPearl: 'GFR (glomerular filtration rate) is the gold-standard measure of kidney function. Estimated by CKD-EPI equation using creatinine ± cystatin C. CKD staging: G1 (>90), G2 (60–89), G3a (45–59), G3b (30–44), G4 (15–29), G5 (<15 — kidney failure).',
          mnemonic: 'Tubule functions: PCT = 67% Na/water, glucose, amino acids, HCO₃⁻, uric acid. LOH descending = water. LOH ascending = Na/K/Cl (impermeable to water). DCT = Na/Cl, Ca²⁺ (PTH). CD = water (ADH), K⁺/H⁺ (aldosterone).',
          children: [
            { id: 'glomerulus', name: 'Glomerulus', color: '#0c4a6e', priority: 2, level: 'microstructure', bodyRegions: ['abdomen'], tagline: 'Tuft of capillaries; ultrafiltration of plasma', description: 'The glomerulus is a capillary network within Bowman\'s capsule. The filtration barrier has three layers: fenestrated endothelium (size), basement membrane (charge — negatively charged, repels albumin), podocytes with foot processes (size). GFR ~120 mL/min normally.', clinicalPearl: 'Nephrotic vs nephritic: Nephrotic = massive proteinuria (>3.5g/day), hypoalbuminaemia, oedema, hyperlipidaemia. Nephritic = haematuria ("smoky urine"), RBC casts, hypertension, oliguria, mild proteinuria.', pathologies: ['Minimal change disease (nephrotic — children, steroid-responsive)', 'Membranous nephropathy (nephrotic — adults)', 'IgA nephropathy (most common GN — Berger disease)', 'Post-streptococcal GN (nephritic)'] },
            { id: 'loop-of-henle', name: 'Loop of Henle', color: '#0c4a6e', priority: 2, level: 'microstructure', bodyRegions: ['abdomen'], tagline: 'Countercurrent multiplier; creates medullary osmotic gradient', description: 'The loop of Henle descends into the medulla and returns to the cortex. Descending limb: permeable to water only (water leaves → tubular fluid becomes concentrated). Ascending thick limb: Na⁺/K⁺/2Cl⁻ cotransporter (NKCC2) — impermeable to water (diluting segment). Creates the osmotic gradient needed for urine concentration.', clinicalPearl: 'Loop diuretics (furosemide) block NKCC2 in the thick ascending limb — most potent diuretics. Cause hypokalaemia and metabolic alkalosis. Used in: pulmonary oedema, heart failure, hypertensive urgency, hypercalcaemia.', pathologies: ['Bartter syndrome (NKCC2 mutation — like having a loop diuretic on board)'] },
          ],
        },
      ],
    },
  ],
}

// ── MUSCULOSKELETAL ───────────────────────────────────────────────────────────
const musculoskeletal: AnatomyNode = {
  id: 'musculoskeletal', name: 'Musculoskeletal System', emoji: '🦴',
  color: '#d97706', priority: 1, level: 'system', bodyRegions: ['head', 'neck', 'chest', 'abdomen', 'arm', 'leg', 'back'],
  tagline: '206 bones + ~640 muscles; structure, movement, protection',
  description: 'The musculoskeletal system provides structural support, enables movement, and protects vital organs. Bone is dynamic connective tissue — constantly remodelled by osteoblasts (formation) and osteoclasts (resorption). Red marrow (axial skeleton) produces blood cells.',
  clinicalPearl: 'Osteoporosis: T-score ≤ −2.5 on DEXA. Most common cause of fracture in elderly. Vertebral compression, hip, and distal radius (Colles\') fractures predominate. Bisphosphonates inhibit osteoclasts.',
  pathologies: ['Osteoporosis', 'Osteoarthritis', 'Rheumatoid arthritis', 'Fractures', 'Osteomyelitis', 'Bone tumours (osteosarcoma, Ewing\'s)', 'Gout (uric acid crystals)', 'Rhabdomyolysis'],
  children: [
    { id: 'axial-skeleton', name: 'Axial Skeleton', color: '#b45309', priority: 1, level: 'organ', bodyRegions: ['head', 'back', 'chest'], tagline: '80 bones: skull + vertebral column + ribs + sternum', description: 'The axial skeleton forms the central axis of the body. The vertebral column (33 vertebrae: C7, T12, L5, S5 fused → sacrum, 4 coccygeal) protects the spinal cord. Intervertebral discs (fibrocartilage) act as shock absorbers. The nucleus pulposus (gel centre) can herniate posterolaterally.', clinicalPearl: 'Disc herniation most common at L4–L5 (L5 root: foot drop, big toe weakness) and L5–S1 (S1 root: absent ankle jerk, calf weakness). Cervical: C5–C6 most common (biceps reflex, deltoid).', pathologies: ['Disc herniation (sciatica)', 'Spinal stenosis', 'Compression fractures (osteoporosis)', 'Ankylosing spondylitis (sacroiliac joints + spine fusion)', 'Scoliosis'], mnemonic: 'C4 = cape on shoulders. C5 = shoulder abduction + elbow flexion. C6 = bicep reflex. C7 = tricep reflex. C8/T1 = intrinsic hand muscles. "C5-6 carry the beer; C7 puts the beer down."' },
  ],
}

// ── ENDOCRINE ─────────────────────────────────────────────────────────────────
const endocrine: AnatomyNode = {
  id: 'endocrine', name: 'Endocrine System', emoji: '⚗️',
  color: '#f59e0b', priority: 2, level: 'system', bodyRegions: ['head', 'neck', 'abdomen'],
  tagline: 'Hormone-based communication; controls metabolism, growth, reproduction',
  description: 'The endocrine system uses hormones (chemical messengers) secreted into the bloodstream to regulate distant target organs. Major glands: hypothalamus-pituitary axis (master regulator), thyroid, parathyroid, adrenal, pancreas (endocrine portion), gonads.',
  clinicalPearl: 'The hypothalamic-pituitary-target organ axis uses negative feedback. Too much target hormone → suppresses hypothalamus/pituitary. Most endocrine disorders are due to tumours (excess) or autoimmune destruction (deficiency).',
  pathologies: ['Diabetes mellitus (Type 1 autoimmune, Type 2 insulin resistance)', 'Hypothyroidism (Hashimoto\'s most common)', 'Hyperthyroidism (Graves\' most common)', 'Cushing\'s syndrome (cortisol excess)', 'Addison\'s disease (cortisol deficiency)', 'Acromegaly (GH excess)'],
  children: [
    { id: 'thyroid', name: 'Thyroid Gland', color: '#d97706', priority: 2, level: 'organ', bodyRegions: ['neck'], tagline: 'Butterfly-shaped; T3/T4 metabolism hormones; C cells → calcitonin', description: 'The thyroid wraps around the trachea (C5–T1 level). Follicular cells produce T3 (active, 3 iodines) and T4 (prohormone, 4 iodines — converted to T3 peripherally). Parafollicular C cells produce calcitonin (lowers Ca²⁺). The thyroid is the only gland that stores hormone extracellularly (in follicles as thyroglobulin).', clinicalPearl: 'TSH is the most sensitive test for thyroid function. High TSH = hypothyroid (gland not responding). Low TSH = hyperthyroid (excess T3/T4 suppresses TSH). Hashimoto\'s = anti-TPO antibodies; Graves\' = anti-TSH receptor (stimulating) antibodies.', pathologies: ['Hashimoto\'s thyroiditis (hypothyroid)', 'Graves\' disease (hyperthyroid)', 'Thyroid nodules (5% are malignant)', 'Papillary thyroid cancer (most common, best prognosis)', 'Thyroid storm (hyperthyroid emergency)'], mnemonic: 'T4 → T3 by 5\'-deiodinase. Propylthiouracil (PTU) blocks synthesis AND peripheral conversion. Methimazole blocks synthesis only. "PTU for Pregnant patients and Thyroid storm."' },
    { id: 'adrenal', name: 'Adrenal Glands', color: '#d97706', priority: 2, level: 'organ', bodyRegions: ['abdomen'], tagline: 'Cortex (steroids) + Medulla (catecholamines); sits atop each kidney', description: 'Each adrenal gland has a cortex and medulla. Cortex (from mesoderm, GFR zones): Zona Glomerulosa (mineralocorticoids — aldosterone), Zona Fasciculata (glucocorticoids — cortisol), Zona Reticularis (androgens — DHEA). Medulla (from neural crest): epinephrine (80%) + norepinephrine (20%).', clinicalPearl: 'Conn\'s syndrome (primary hyperaldosteronism): hypertension + hypokalaemia + metabolic alkalosis. Most common cause of secondary hypertension. Adrenal adenoma (70%) or bilateral hyperplasia (30%). Screen with aldosterone:renin ratio.', pathologies: ['Cushing\'s syndrome (cortisol excess)', 'Addison\'s disease (adrenal insufficiency)', 'Conn\'s syndrome (hyperaldosteronism)', 'Phaeochromocytoma (catecholamine-secreting tumour — "Rule of 10s")', 'Congenital adrenal hyperplasia (21-hydroxylase deficiency most common)'], mnemonic: '"GFR" from outside to inside: Glomerulosa (salt — aldosterone), Fasciculata (sugar — cortisol), Reticularis (sex — androgens). "Salt, Sugar, Sex — the deeper you go, the sweeter it gets."' },
  ],
}

// ── TOP-LEVEL EXPORT ──────────────────────────────────────────────────────────

export const ANATOMY_SYSTEMS: AnatomyNode[] = [
  cardiovascular,
  respiratory,
  nervous,
  musculoskeletal,
  digestive,
  urinary,
  endocrine,
  {
    id: 'reproductive', name: 'Reproductive System', emoji: '🧬',
    color: '#ec4899', priority: 2, level: 'system', bodyRegions: ['pelvis', 'abdomen'],
    tagline: 'Gametogenesis, fertilisation, gestation',
    description: 'Male and female reproductive systems produce gametes and enable reproduction. The male system: testes (spermatogenesis + testosterone), epididymis, vas deferens, seminal vesicles, prostate, urethra. Female: ovaries (oogenesis + oestrogen/progesterone), fallopian tubes, uterus, cervix, vagina.',
    clinicalPearl: 'Ectopic pregnancy (95% in fallopian tube) is a medical emergency — rupture causes haemoperitoneum. Risk factors: prior STI (PID → tubal damage), IUD, previous ectopic.',
    pathologies: ['Ectopic pregnancy', 'PCOS (polycystic ovarian syndrome)', 'Endometriosis', 'Prostate cancer (most common male cancer)', 'Cervical cancer (HPV 16/18)', 'Testicular cancer (young men, 95% germ-cell)'],
    children: [],
  },
  {
    id: 'lymphatic', name: 'Lymphatic / Immune System', emoji: '🛡️',
    color: '#6366f1', priority: 2, level: 'system', bodyRegions: ['head', 'neck', 'chest', 'abdomen', 'arm', 'leg'],
    tagline: 'Fluid return, fat absorption, immune surveillance',
    description: 'The lymphatic system drains interstitial fluid back to the venous circulation via lymph capillaries → lymph vessels → lymph nodes → thoracic duct → left subclavian vein. Lymph nodes filter lymph and are home to lymphocytes. Thymus (T-cell maturation), bone marrow (B-cell maturation), spleen (blood filter), tonsils, MALT.',
    clinicalPearl: 'Virchow\'s node = left supraclavicular lymphadenopathy from abdominal/pelvic malignancy (via thoracic duct). Sister Mary Joseph\'s nodule = periumbilical metastasis from GI cancer.',
    pathologies: ['Lymphoma (Hodgkin vs Non-Hodgkin)', 'Leukaemia (marrow failure)', 'Lymphoedema (obstruction — breast cancer treatment)', 'HIV/AIDS (CD4+ T-cell depletion)', 'SLE (autoimmune)'],
    children: [],
  },
  {
    id: 'integumentary', name: 'Integumentary System', emoji: '🩹',
    color: '#78716c', priority: 3, level: 'system', bodyRegions: ['head', 'neck', 'chest', 'abdomen', 'arm', 'leg'],
    tagline: 'Skin + hair + nails; largest organ (1.5–2 m²)',
    description: 'The skin has three layers: epidermis (keratinocytes, melanocytes, Langerhans cells, Merkel cells), dermis (collagen, elastin, blood vessels, nerves, hair follicles, sweat glands), and hypodermis/subcutaneous fat. Functions: barrier, thermoregulation, UV protection, sensory, vitamin D synthesis, immune surveillance.',
    clinicalPearl: 'Basal cell carcinoma (BCC, most common skin cancer — locally invasive, rarely metastasises), squamous cell carcinoma (SCC, second, can metastasise), melanoma (least common but most deadly — ABCDE criteria).',
    pathologies: ['Melanoma (ABCDE: Asymmetry, Border, Colour, Diameter, Evolution)', 'Basal cell carcinoma', 'Squamous cell carcinoma', 'Psoriasis (IL-17/IL-23 pathway)', 'Eczema/atopic dermatitis', 'Pressure ulcers'],
    children: [],
  },
]

// ── Body region → systems mapping ─────────────────────────────────────────────

export const REGION_SYSTEMS: Record<BodyRegion, string[]> = {
  head:    ['nervous', 'endocrine', 'integumentary', 'lymphatic'],
  neck:    ['endocrine', 'digestive', 'respiratory', 'musculoskeletal', 'lymphatic'],
  chest:   ['cardiovascular', 'respiratory', 'musculoskeletal', 'lymphatic'],
  abdomen: ['digestive', 'urinary', 'endocrine', 'musculoskeletal', 'lymphatic', 'cardiovascular'],
  pelvis:  ['reproductive', 'urinary', 'digestive', 'musculoskeletal'],
  arm:     ['musculoskeletal', 'nervous', 'cardiovascular', 'lymphatic'],
  leg:     ['musculoskeletal', 'nervous', 'cardiovascular', 'lymphatic'],
  back:    ['musculoskeletal', 'nervous'],
}
