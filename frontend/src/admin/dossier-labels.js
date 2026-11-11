export const categories = {
  ENTRETIEN_INITIAL: 'Entretien initial',
  POSITIONNEMENT: 'Positionnement',
  CONVENTION_CONTRAT: 'Convention ou contrat',
  REGLEMENT_INTERIEUR: 'Règlement intérieur',
  PROGRAMME: 'Programme',
  EMARGEMENT: 'Émargement',
  EVALUATIONS: 'Évaluations',
  SATISFACTION_CHAUD: 'Satisfaction à chaud',
  SATISFACTION_FROID: 'Satisfaction à froid',
  ATTESTATION: 'Attestation',
};

export const etats = {
  A_PREPARER: 'À préparer',
  EN_ATTENTE: 'En attente',
  RECU: 'Reçu',
  VERIFIE: 'Vérifié',
  NON_APPLICABLE: 'Non applicable',
};

export const statutsInscription = {
  EN_ATTENTE: 'En attente',
  CONFIRMEE: 'Confirmée',
  REFUSEE: 'Refusée',
  ANNULEE: 'Annulée',
};

export function restantATraiter(elements) {
  return elements.filter(element => !['VERIFIE', 'NON_APPLICABLE'].includes(element.etat)).length;
}
