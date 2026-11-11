import PresenceSynthese from '../presences/PresenceSynthese';
import AttestationsDossier from './AttestationsDossier';
import QuestionnairesDossier from './QuestionnairesDossier';
import {useEffect, useRef, useState} from 'react';
import {adminRequest} from './api';
import {FormField} from './CatalogueResource';
import {formatParis} from './session-time';
import {categories, etats, statutsInscription, restantATraiter} from './dossier-labels';
import PiecesJointes from './PiecesJointes';

const valeursDu = dossier => dossier?.elements.map(({categorie, etat, note}) => ({categorie, etat, note})) || [];
const etatOptions = Object.entries(etats).map(([value, label]) => ({value, label}));

function HistoriqueDossier({item}) {
  const documents = item.dossier?.elements.flatMap(element => element.historique.map(event => ({
    ...event, categorie: element.categorie, type: 'document',
  }))) || [];
  const inscription = item.historique.map((event, index) => ({...event, id: 'statut-' + index, type: 'inscription'}));
  const initialisation = item.dossier ? [{
    id: 'initialisation', date: item.dossier.createdAt, type: 'initialisation',
  }] : [];
  const fichiers = item.dossier?.elements.flatMap(element => element.fichiers.map(file => ({
    ...file, categorie: element.categorie, type: 'depot',
  }))) || [];
  const events = [...inscription, ...initialisation, ...documents, ...fichiers]
    .sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id));

  return <section className="admin-panel" aria-labelledby="dossier-historique">
    <h2 id="dossier-historique">Historique</h2>
    <ol className="admin-dossier-history">{events.map(event => <li key={event.id}>
      <p><time dateTime={event.date}>{formatParis(event.date)}</time>
        {' · '}{event.auteur?.email || 'Système'}</p>
      {event.type === 'initialisation' && <p>Initialisation du dossier et conservation de sa configuration documentaire.</p>}
      {event.type === 'inscription' && <p>Inscription · {event.ancienStatut ? statutsInscription[event.ancienStatut] + ' → ' : 'Dépôt · '}{statutsInscription[event.nouveauStatut]}</p>}
      {event.type === 'depot' && <p>Pièce jointe · {categories[event.categorie]} · Version {event.version} · {event.nomOriginal}</p>}
      {event.type === 'document' && <>
        <p>{categories[event.categorie]} · {etats[event.ancienEtat]} → {etats[event.nouvelEtat]}</p>
        {event.ancienneNote !== event.nouvelleNote && <>
          <p className="admin-dossier-note">Note précédente · {event.ancienneNote || 'Vide'}</p>
          <p className="admin-dossier-note">Nouvelle note · {event.nouvelleNote || 'Vide'}</p>
        </>}
      </>}
    </li>)}</ol>
  </section>;
}

export default function DossierAdministratif({id, setDirty}) {
  const url = '/api/admin/inscriptions/' + encodeURIComponent(id) + '/dossier';
  const [item, setItem] = useState(null);
  const [values, setValues] = useState([]);
  const [baseline, setBaseline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [success, setSuccess] = useState('');
  const [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pendingFiles = useRef(new Set());
  const manualDirty = useRef(false);
  useEffect(() => {
    manualDirty.current = JSON.stringify(values) !== JSON.stringify(baseline);
  }, [values, baseline]);

  function fichierSelectionne(categorie, pending) {
    if (pending) pendingFiles.current.add(categorie);
    else pendingFiles.current.delete(categorie);
    setDirty(manualDirty.current || pendingFiles.current.size > 0);
  }

  function versionsRecues(categorie, fichiers) {
    setItem(previous => ({
      ...previous,
      dossier: {...previous.dossier, elements: previous.dossier.elements.map(element =>
        element.categorie === categorie ? {...element, fichiers} : element)},
    }));
  }

  async function attestationEmise() {
    // Ne jamais remplacer les notes et états en cours de saisie.
    try {
      const next = (await adminRequest(url)).item;
      setItem(previous => ({...previous, dossier: {...previous.dossier, elements: next.dossier.elements}}));
    } catch { setError('Attestation enregistrée. Rechargez les pièces jointes pour actualiser leur liste.'); }
  }

  function recevoir(next) {
    const elements = valeursDu(next.dossier);
    setItem(next);
    setValues(elements);
    setBaseline(elements);
  }

  useEffect(() => {
    const controller = new AbortController();
    adminRequest(url, {signal: controller.signal})
      .then(data => {if (!controller.signal.aborted) recevoir(data.item);})
      .catch(err => {if (!controller.signal.aborted) setError(err.message);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [url, attempt]);

  function modifier(index, name, value) {
    const next = values.map((element, i) => i === index ? {...element, [name]: value} : element);
    setValues(next);
    setDirty(JSON.stringify(next) !== JSON.stringify(baseline) || pendingFiles.current.size > 0);
    setSuccess('');
    setFields(previous => ({...previous, ['elements.' + index + '.' + name]: undefined}));
  }

  async function initialiser() {
    setBusy(true);
    setError('');
    try {
      await adminRequest(url + '/initialiser', {method: 'POST', body: '{}'});
      recevoir((await adminRequest(url)).item);
      setSuccess('Dossier initialisé.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function enregistrer(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    setFields({});
    try {
      const data = await adminRequest(url, {
        method: 'PUT',
        body: JSON.stringify({updatedAt: item.dossier.updatedAt, elements: values}),
      });
      recevoir(data.item);
      setDirty(pendingFiles.current.size > 0);
      setSuccess('Suivi documentaire enregistré.');
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
      if (err.code === 'CONFLICT') setConflict(true);
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    setError('');
    setLoading(true);
    setAttempt(n => n + 1);
  }

  return <>
    <a className="admin-back" href="/admin/inscriptions">← Inscriptions</a>
    <div className="admin-page-heading"><div><h1>Dossier administratif</h1>
      <p>Suivi individuel rattaché à l’inscription.</p>
    </div></div>
    {loading && <p role="status">Chargement du dossier…</p>}
    {error && <div className="admin-notice error" role="alert"><p>{error}</p>
      {conflict ? <a href={window.location.pathname}>Recharger le dossier</a> :
        !item && <button type="button" className="admin-button secondary" onClick={retry}>Réessayer</button>}
    </div>}
    {success && <p className="admin-notice success" role="status">{success}</p>}
    {item && <>
      <PresenceSynthese id={id} admin/>
      {item.dossier && <AttestationsDossier id={id} onPending={fichierSelectionne} onEmission={attestationEmise} />}
      <QuestionnairesDossier id={id} identite={item.prenom+' '+item.nom} />
      <section className="admin-panel" aria-labelledby="dossier-synthese">
        <h2 id="dossier-synthese">Synthèse</h2>
        <dl className="admin-dossier-summary">
          <div><dt>Identité</dt><dd>{item.prenom} {item.nom}</dd></div>
          <div><dt>Email</dt><dd>{item.email}</dd></div>
          <div><dt>Formation</dt><dd>{item.session.formation.titre}</dd></div>
          <div><dt>Statut de l’inscription</dt><dd>{statutsInscription[item.statut]}</dd></div>
          <div><dt>Date de demande</dt><dd>{formatParis(item.createdAt)}</dd></div>
          {item.dossier && <div><dt>Dernière modification documentaire</dt><dd>{formatParis(item.dossier.updatedAt)}</dd></div>}
        </dl>
        <h3>Session · Europe/Paris</h3>
        {item.session.seances.length ? <ul>{item.session.seances.map((seance, index) => <li key={index}>
          <time dateTime={seance.debut}>{formatParis(seance.debut)}</time> → <time dateTime={seance.fin}>{formatParis(seance.fin)}</time>
        </li>)}</ul> : <p>Dates à préparer.</p>}
        <a href={'/admin/inscriptions/' + item.id}>Consulter le statut de l’inscription</a>
      </section>

      <section className="admin-panel" aria-labelledby="dossier-financement">
        <h2 id="dossier-financement">Financement</h2>
        <p>{item.typeDemande === 'PARTICULIER' ? 'Particulier' : 'Professionnel avec demande de financement'}</p>
        {item.typeDemande === 'PROFESSIONNEL_FINANCEMENT' && <p>Organisme envisagé · {item.organismeEnvisage || 'Non renseigné'}</p>}
        <p>Le financement fait l’objet d’un traitement distinct du statut de l’inscription.</p>
      </section>

      <section className="admin-panel" aria-labelledby="dossier-preparation">
        <h2 id="dossier-preparation">Préparation documentaire</h2>
        <p className="admin-notice">Suivi manuel. Un état renseigné ne constitue pas une preuve de signature, de présence ou de conformité.</p>
        <p>Le parcours documentaire est conservé à la création du dossier. Les changements ultérieurs de la formation ne modifient pas cette configuration.</p>
        {!item.dossier ? <>
          <p>Ce dossier attend une initialisation explicite.</p>
          <button type="button" className="admin-button" disabled={busy} onClick={initialiser}>Initialiser le dossier</button>
        </> : !item.dossier.parcoursDocumentaire ? <p>Le parcours documentaire est désactivé pour ce dossier.</p> : <>
          <p role="status"><strong>{restantATraiter(values)} élément(s) restant à traiter</strong>
            {JSON.stringify(values) !== JSON.stringify(baseline) && ' · selon la saisie non enregistrée'}</p>
          {fields.elements && <p className="admin-field-error" role="alert">{fields.elements}</p>}
          <form onSubmit={enregistrer} noValidate aria-busy={busy}>
            {values.map((element, index) => <fieldset key={element.categorie} className="admin-document-element" disabled={busy}>
              <legend>{categories[element.categorie]}</legend>
              <FormField field={{name: element.categorie + '-etat', label: 'État du suivi', required: true, type: 'select', options: etatOptions}}
                value={element.etat} error={fields['elements.' + index + '.etat']} onChange={value => modifier(index, 'etat', value)} />
              <FormField field={{name: element.categorie + '-note', label: 'Note administrative', multiline: true, rows: 3, max: 500, hint: '500 caractères maximum.'}}
                value={element.note} error={fields['elements.' + index + '.note']} onChange={value => modifier(index, 'note', value)} />
              <PiecesJointes inscriptionId={id} categorie={element.categorie}
                fichiers={item.dossier.elements.find(row => row.categorie === element.categorie)?.fichiers || []}
                onVersions={versionsRecues} onPending={fichierSelectionne} />
            </fieldset>)}
            <button className="admin-button" disabled={busy || conflict} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer le suivi'}</button>
          </form>
        </>}
      </section>
      <HistoriqueDossier item={item} />
    </>}
  </>;
}
