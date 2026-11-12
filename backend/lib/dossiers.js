export const categoriesDocumentaires = [
  'ENTRETIEN_INITIAL', 'POSITIONNEMENT', 'CONVENTION_CONTRAT', 'REGLEMENT_INTERIEUR',
  'PROGRAMME', 'EMARGEMENT', 'EVALUATIONS', 'SATISFACTION_CHAUD', 'SATISFACTION_FROID', 'ATTESTATION',
];

export const etatsDocumentaires = ['A_PREPARER', 'EN_ATTENTE', 'RECU', 'VERIFIE', 'NON_APPLICABLE'];

// À appeler seulement dans une transaction d'écriture explicite.
export async function initialiserDossier(tx, inscriptionId) {
  const existing = await tx.dossierAdministratif.findUnique({
    where: { inscriptionId }, select: { inscriptionId: true },
  });
  if (existing) return true;

  const inscription = await tx.inscription.findUnique({
    where: { id: inscriptionId },
    select: { session: { select: { formation: { select: { parcoursDocumentaire: true, reglesDocumentaires: true } } } } },
  });
  if (!inscription) return false;
  const parcoursDocumentaire = inscription.session.formation.parcoursDocumentaire;
  const [created] = await tx.dossierAdministratif.createManyAndReturn({
    data: [{ inscriptionId, parcoursDocumentaire }], skipDuplicates: true,
    select: { inscriptionId: true },
  });
  if (created && parcoursDocumentaire) {
    await tx.elementDocumentaire.createMany({
      data: categoriesDocumentaires.map(categorie => ({ inscriptionId, categorie, ...(inscription.session.formation.reglesDocumentaires.find(r => r.categorie === categorie) || {}) })),
      skipDuplicates: true,
    });
  }
  return true;
}
