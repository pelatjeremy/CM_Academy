export function sessionAccepteDemandes(session, now = new Date()) {
  return session.preinscriptionsOuvertes && session.seances.length > 0
    && session.seances[0].debut > now;
}

// L'adaptateur pg peut laisser remonter le conflit natif au COMMIT.
// Ces deux SQLSTATE garantissent l'annulation de la transaction ; aucune panne
// réseau ni erreur au résultat de commit incertain ne doit être réessayée ici.
export function normaliserConflitTransaction(error) {
  if (error?.name === 'DriverAdapterError' && error.cause?.kind === 'TransactionWriteConflict'
      && ['40001', '40P01'].includes(error.cause.originalCode)) {
    return Object.assign(new Error('CONCURRENT_TRANSACTION'), {code: 'P2034', cause: error});
  }
  return error;
}

export async function inscriptionTransaction(prisma, action) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(action, { isolationLevel: 'Serializable' });
    } catch (error) {
      error = normaliserConflitTransaction(error);
      if (error.code !== 'P2034' || attempt === 4) throw error;
    }
  }
}
