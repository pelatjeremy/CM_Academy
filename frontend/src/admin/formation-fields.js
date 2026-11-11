const requiredToPublish = 'Requis pour publier. Peut rester vide dans un brouillon.';
export const formationSections = [
  { title: '1. Présentation', fields: [
    { name: 'titre', label: 'Titre', required: true, max: 160 },
    { name: 'slug', label: 'Adresse de la page', max: 160, publication: true, hint: `${requiredToPublish} Minuscules, chiffres et tirets simples.` },
    { name: 'resume', label: 'Résumé', multiline: true, rows: 3, max: 1000, hint: 'Présentation courte facultative.' },
    { name: 'description', label: 'Description', multiline: true, max: 5000, publication: true, hint: requiredToPublish },
    { name: 'poleId', label: 'Pôle', type: 'select', publication: true, hint: requiredToPublish },
  ] },
  { title: '2. Programme', fields: [
    { name: 'objectifs', label: 'Objectifs', multiline: true, max: 5000, publication: true, hint: requiredToPublish },
    { name: 'programme', label: 'Programme', multiline: true, max: 10000, publication: true, hint: requiredToPublish },
    { name: 'publicVise', label: 'Public visé', multiline: true, rows: 3, max: 3000, publication: true, hint: requiredToPublish },
    { name: 'prerequis', label: 'Prérequis', multiline: true, rows: 3, max: 3000, publication: true, hint: `${requiredToPublish} Indiquez explicitement « Aucun prérequis » le cas échéant.` },
  ] },
  { title: '3. Organisation', fields: [
    { name: 'format', label: 'Format', type: 'select', publication: true, hint: requiredToPublish, options: [{ value: 'WEBINAIRE', label: 'Webinaire' }, { value: 'PRESENTIEL', label: 'Présentiel' }, { value: 'HYBRIDE', label: 'Hybride' }] },
    { name: 'dureeMinutes', label: 'Durée (minutes)', inputMode: 'numeric', publication: true, hint: `${requiredToPublish} Entier positif ; 3 h 30 = 210 minutes.` },
    { name: 'formateurIds', label: 'Formateurs', type: 'choices', publication: true, hint: 'Au moins un formateur requis pour publier. Plusieurs choix possibles, sans doublon.' },
  ] },
  { title: '4. Tarification', fields: [
    { name: 'tarif', label: 'Tarif', inputMode: 'decimal', max: 32, hint: 'Vide = tarif non renseigné. 0,00 = formation gratuite. Deux décimales maximum, sans arrondi automatique.' },
    { name: 'devise', label: 'Devise', max: 3, hint: 'Code de trois lettres majuscules, par exemple EUR. Par défaut : EUR.' },
    { name: 'financement', label: 'Informations de financement', multiline: true, rows: 4, max: 3000 },
  ] },
  { title: '5. Suivi documentaire', fields: [
    { name: 'parcoursDocumentaire', label: 'Activer le parcours documentaire', type: 'checkbox', hint: 'Réglage indépendant du format. Aucun document ni processus de signature n’est créé à cette étape.' },
  ] },
];
export const formationFields = formationSections.flatMap(section => section.fields);
export const blankFormation = Object.fromEntries(formationFields.map(field => [field.name,
  field.name === 'devise' ? 'EUR' : field.name === 'parcoursDocumentaire' ? false : field.name === 'formateurIds' ? [] : ''
]));
export function formationValues(item) {
  return Object.fromEntries(formationFields.map(field => [field.name,
    field.name === 'formateurIds' ? [...item.formateurIds].sort() : field.name === 'dureeMinutes' ? String(item.dureeMinutes ?? '') : item[field.name] ?? ''
  ]));
}
