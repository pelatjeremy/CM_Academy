export const resources = {
  formations: { title: 'Formations', singular: 'formation', article: 'une', name: 'titre', summary: 'description',
    description: 'Préparez les fiches pédagogiques et gérez leur publication.' },
  sessions: {title:'Sessions',singular:'session',article:'une',description:'Planifiez les séances datées et les informations pratiques.'},
  poles: { title: 'Pôles', singular: 'pôle', name: 'titre', summary: 'description',
    description: 'Organisez les domaines de formation de CMH Academy.',
    fields: [
      { name: 'titre', label: 'Titre', required: true, max: 160 },
      { name: 'slug', label: 'Adresse de la page', required: true, max: 160, hint: 'Minuscules, chiffres et tirets simples, par exemple commerce-du-cheval.' },
      { name: 'description', label: 'Description', multiline: true, max: 3000 },
    ] },
  formateurs: { title: 'Formateurs', singular: 'formateur', name: 'nom', summary: 'biographie',
    description: 'Préparez les fiches de présentation des intervenants.',
    fields: [
      { name: 'nom', label: 'Nom complet', required: true, max: 160 },
      { name: 'biographie', label: 'Biographie', multiline: true, max: 3000, hint: 'Présentation destinée au catalogue. Ne saisissez pas de coordonnées privées.' },
    ] },
};
