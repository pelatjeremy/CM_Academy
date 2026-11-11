import InvitationStagiaire from './InvitationStagiaire';
import {useEffect, useState} from 'react';
import {adminRequest} from './api';
import {formatParis} from './session-time';
import {statutsInscription as statuts} from './dossier-labels';

const actions = {
  EN_ATTENTE: [['CONFIRMEE', 'Confirmer'], ['REFUSEE', 'Refuser'], ['ANNULEE', 'Annuler la demande']],
  CONFIRMEE: [['ANNULEE', 'Annuler la demande']],
  REFUSEE: [],
  ANNULEE: [],
};
const typeDemande = item => item.typeDemande === 'PARTICULIER' ? 'Particulier' : 'Professionnel avec demande de financement';
const sessionLabel = session => session.formation.titre + (session.seances.length ? ' · ' + formatParis(session.seances[0].debut) : ' · Sans date');

function useInscriptions(url) {
  const [etat, setEtat] = useState({chargement: true});
  useEffect(() => {
    const controller = new AbortController();
    adminRequest(url, {signal: controller.signal})
      .then(data => { if (!controller.signal.aborted) setEtat({data}); })
      .catch(error => { if (!controller.signal.aborted) setEtat({erreur: error.message}); });
    return () => controller.abort();
  }, [url]);
  return [etat, setEtat];
}

function ListeInscriptions() {
  const [params, setParams] = useState({q: '', statut: '', sessionId: '', page: 1});
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== ''));
  const [liste, setListe] = useInscriptions('/api/admin/inscriptions?' + query);
  const [options] = useInscriptions('/api/admin/inscriptions/options');

  function filtre(name, value) {
    setListe({chargement: true});
    setParams(previous => ({...previous, page: 1, [name]: value}));
  }

  function chercher(event) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q').trim();
    if (q !== params.q || params.page !== 1) filtre('q', q);
  }

  return <section>
    <div className="admin-page-heading"><div><h1>Inscriptions</h1><p>Suivez les demandes de préinscription et les places confirmées.</p></div></div>
    <div className="admin-panel">
      <div className="admin-filter-grid">
        <form onSubmit={chercher}>
          <label className="admin-label" htmlFor="inscriptions-recherche">Nom, prénom ou email</label>
          <div className="admin-actions">
            <input className="admin-input" name="q" id="inscriptions-recherche" type="search" maxLength={150} />
            <button className="admin-button secondary">Rechercher</button>
          </div>
        </form>
        <div>
          <label className="admin-label" htmlFor="inscriptions-session">Session</label>
          <select className="admin-input" id="inscriptions-session" value={params.sessionId} onChange={event => filtre('sessionId', event.target.value)}>
            <option value="">Toutes les sessions</option>
            {options.data?.sessions.map(session => <option value={session.id} key={session.id}>{sessionLabel(session)}</option>)}
          </select>
          {options.erreur && <p role="alert">{options.erreur}</p>}
        </div>
        <div>
          <label className="admin-label" htmlFor="inscriptions-statut">Statut</label>
          <select className="admin-input" id="inscriptions-statut" value={params.statut} onChange={event => filtre('statut', event.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(statuts).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </div>
      </div>
      {liste.chargement && <p role="status">Chargement des demandes…</p>}
      {liste.erreur && <p role="alert">{liste.erreur}</p>}
      {liste.data && <>
        <p className="admin-count" role="status">{liste.data.total} demande(s)</p>
        {liste.data.items.length === 0 ? <p>Aucune demande à afficher.</p> : <ul className="admin-resource-list">
          {liste.data.items.map(item => <li key={item.id}>
            <div><h2><a href={'/admin/inscriptions/' + item.id}>{item.prenom} {item.nom}</a></h2>
              <p>{sessionLabel(item.session)}</p><p>{typeDemande(item)}</p>
              <a href={'/admin/inscriptions/' + item.id + '/dossier'}>Ouvrir le dossier administratif</a></div>
            <span className={'admin-badge ' + (item.statut === 'CONFIRMEE' ? 'published' : 'draft')}>{statuts[item.statut]}</span>
          </li>)}
        </ul>}
        {liste.data.total > 20 && <nav className="admin-pagination" aria-label="Pagination des inscriptions">
          <button className="admin-button secondary" disabled={params.page === 1} onClick={() => filtre('page', params.page - 1)}>Précédent</button>
          <span>Page {params.page} sur {Math.ceil(liste.data.total / 20)}</span>
          <button className="admin-button secondary" disabled={params.page * 20 >= liste.data.total} onClick={() => filtre('page', params.page + 1)}>Suivant</button>
        </nav>}
      </>}
    </div>
  </section>;
}

function DetailInscription({id}) {
  const url = '/api/admin/inscriptions/' + encodeURIComponent(id);
  const [etat, setEtat] = useInscriptions(url);
  const [action, setAction] = useState({});
  const item = etat.data?.item;

  async function changer(statut) {
    setAction({enCours: true});
    try {
      await adminRequest(url + '/statut', {
        method: 'PUT',
        body: JSON.stringify({statut, statutAttendu: item.statut}),
      });
      setEtat({data: await adminRequest(url)});
      setAction({message: 'Statut mis à jour.'});
    } catch (error) {
      setAction({erreur: error.message});
    }
  }

  return <section>
    <a className="admin-back" href="/admin/inscriptions">← Toutes les inscriptions</a>
    <div className="admin-page-heading"><div><h1>{item ? item.prenom + ' ' + item.nom : 'Demande de préinscription'}</h1></div></div>
    {etat.chargement && <p role="status">Chargement de la demande…</p>}
    {etat.erreur && <p role="alert">{etat.erreur}</p>}
    {item && <>
      <InvitationStagiaire id={id} />
      <div className="admin-panel">
        <h2>Demande</h2>
        <p><a href={'/admin/inscriptions/' + item.id + '/dossier'}>Ouvrir le dossier administratif</a></p>
        <dl>
          <dt>Session</dt><dd>{sessionLabel(item.session)}</dd>
          <dt>Adresse email</dt><dd>{item.email}</dd>
          <dt>Demande reçue le</dt><dd>{formatParis(item.createdAt)}</dd>
          <dt>Statut de l’inscription</dt><dd>{statuts[item.statut]}</dd>
          <dt>Type de demande</dt><dd>{typeDemande(item)}</dd>
          {item.typeDemande === 'PROFESSIONNEL_FINANCEMENT' && <>
            <dt>Organisme envisagé</dt><dd>{item.organismeEnvisage || 'Non renseigné'}</dd>
            <dt>Financement</dt><dd>Demande à traiter séparément. Le statut d’inscription ne vaut pas accord de financement.</dd>
          </>}
        </dl>
        {action.erreur && <p role="alert">{action.erreur}</p>}
        {action.message && <p role="status">{action.message}</p>}
        <div className="admin-actions">
          {actions[item.statut].map(([statut, label]) => <button type="button" key={statut} disabled={action.enCours}
            className={'admin-button' + (statut === 'CONFIRMEE' ? '' : ' secondary')} onClick={() => changer(statut)}>{label}</button>)}
        </div>
      </div>
      <div className="admin-panel">
        <h2>Historique des statuts</h2>
        <ol>{item.historique.map((ligne, index) => <li key={index}>
          <time dateTime={ligne.date}>{formatParis(ligne.date)}</time>
          {' · '}{ligne.ancienStatut ? statuts[ligne.ancienStatut] + ' → ' : 'Dépôt · '}{statuts[ligne.nouveauStatut]}
          {ligne.auteur && ' · ' + ligne.auteur.email}
        </li>)}</ol>
      </div>
    </>}
  </section>;
}

export default function Inscriptions({id}) {
  return id ? <DetailInscription id={id} /> : <ListeInscriptions />;
}
