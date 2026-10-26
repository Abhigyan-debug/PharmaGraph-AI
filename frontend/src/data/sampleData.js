export const medicineCatalog = [
  'Paracetamol',
  'Ibuprofen',
  'Aspirin',
  'Amoxicillin',
  'Metformin',
  'Warfarin',
  'Atorvastatin',
  'Omeprazole',
  'Clopidogrel'
];

export const documentedInteractions = [
  {
    pair: 'Aspirin + Warfarin',
    severity: 'Major',
    source: 'DrugBank',
    detail: 'Potential increase in bleeding risk due to antiplatelet and anticoagulant effect.'
  },
  {
    pair: 'Omeprazole + Clopidogrel',
    severity: 'Moderate',
    source: 'Known literature',
    detail: 'Reduced antiplatelet activity may reduce protection from clot formation.'
  }
];

export const potentialInteractions = [
  {
    pair: 'Metformin + Atorvastatin',
    probability: 0.82,
    label: 'Medium confidence',
    detail: 'Model predicts possible metabolic overlap; requires clinician review.'
  },
  {
    pair: 'Paracetamol + Omeprazole',
    probability: 0.71,
    label: 'Low confidence',
    detail: 'Graph signal suggests a weak interaction, but no confirmed clinical alert.'
  }
];
