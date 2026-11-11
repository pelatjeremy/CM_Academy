import {useState} from 'react';

export default function Preinscription({sessionId}) {
  const [ouverte, setOuverte] = useState(false);
  const [typeDemande, setTypeDemande] = useState('PARTICULIER');
  const [etat, setEtat] = useState({});

  async function envoyer(event) {
    event.preventDefault();
    if (etat.envoi) return;
    const demande = Object.fromEntries(new FormData(event.currentTarget));
    setEtat({envoi: true});
    try {
      const response = await fetch('/api/sessions/' + encodeURIComponent(sessionId) + '/preinscriptions', {
        method: 'POST',
        credentials: 'omit',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(demande),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (response.status === 202) setEtat({recu: true});
      else setEtat({erreur: data.error || 'L’envoi a échoué. Réessayez.', champs: data.fields});
    } catch {
      setEtat({erreur: 'L’envoi a échoué. Réessayez.'});
    }
  }

  const panel = 'preinscription-' + sessionId;
  if (etat.recu) return <div className="public-notice" role="status">
    <strong>Demande reçue, en attente de validation</strong>
    <p>Le dépôt de la demande ne réserve pas de place et ne confirme aucun financement.</p>
  </div>;

  return <>
    <button type="button" className="button preinscription-button" aria-expanded={ouverte}
      aria-controls={ouverte ? panel : undefined} onClick={() => setOuverte(!ouverte)} disabled={etat.envoi}>
      Demander une place
    </button>
    {ouverte && <form id={panel} className="preinscription-form" onSubmit={envoyer} aria-busy={!!etat.envoi}>
      <fieldset disabled={etat.envoi}>
        <legend>Votre demande de préinscription</legend>
        <p>Camille examinera votre demande. Le dépôt ne réserve pas de place et ne confirme aucun financement.</p>
        {etat.erreur && <p role="alert">{etat.erreur}</p>}
        {[
          ['prenom', 'Prénom', 'text', 'given-name', 100],
          ['nom', 'Nom', 'text', 'family-name', 100],
          ['email', 'Adresse email', 'email', 'email', 254],
        ].map(([name, label, type, autoComplete, maxLength]) => {
          const message = etat.champs?.[name];
          const errorId = panel + '-' + name + '-erreur';
          return <label key={name}>{label}
            <input name={name} type={type} autoComplete={autoComplete} maxLength={maxLength} required
              aria-invalid={!!message} aria-describedby={message ? errorId : undefined} />
            {message && <small id={errorId}>{message}</small>}
          </label>;
        })}
        <label>Type de demande
          <select name="typeDemande" value={typeDemande} onChange={event => setTypeDemande(event.target.value)}>
            <option value="PARTICULIER">Particulier</option>
            <option value="PROFESSIONNEL_FINANCEMENT">Professionnel avec demande de financement</option>
          </select>
        </label>
        {typeDemande === 'PROFESSIONNEL_FINANCEMENT' && <label>Organisme envisagé (facultatif)
          <input name="organismeEnvisage" maxLength={160} aria-invalid={!!etat.champs?.organismeEnvisage} />
          {etat.champs?.organismeEnvisage && <small>{etat.champs.organismeEnvisage}</small>}
        </label>}
        <button type="submit" className="button preinscription-button">{etat.envoi ? 'Envoi…' : 'Envoyer ma demande'}</button>
      </fieldset>
    </form>}
  </>;
}
