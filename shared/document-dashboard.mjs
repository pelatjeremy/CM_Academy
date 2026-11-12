// Présentation administrative uniquement : ne change pas la complétude métier.
export function dossierComplet(item) {
  return item.initialise && item.completude.total > 0 && item.completude.complet;
}
export function actionsDossier(item) {
  return item.actions || {aVerifier:item.completude.aVerifier, aCorriger:item.completude.aCorriger};
}
export function dossierATraiter(item) {
  return item.completude.manquantes > 0 || actionsDossier(item).aCorriger > 0;
}
export function filtreDocumentaire(item, etat) {
  if (!etat) return true;
  if (etat === 'complet') return dossierComplet(item);
  if (etat === 'incomplet') return item.completude.total > 0 && !dossierComplet(item);
  if (etat === 'sansPieces') return item.completude.total === 0;
  if (etat === 'aTraiter') return dossierATraiter(item);
  return actionsDossier(item)[etat] > 0;
}
export function indicateursDocumentaires(items) {
  return {
    suivis:items.length,
    complets:items.filter(dossierComplet).length,
    aVerifier:items.reduce((n,i)=>n+actionsDossier(i).aVerifier,0),
    aTraiter:items.filter(dossierATraiter).length,
  };
}
