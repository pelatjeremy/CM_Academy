import SuiviDocuments from './SuiviDocuments';
import SessionPresences from './SessionPresences';
import ContenuPedagogique from './ContenuPedagogique';
import OrganismeAttestation from './OrganismeAttestation';
import ExitDialog from '../components/ExitDialog';
import QuestionnaireModeles from './QuestionnaireModeles';
import { useEffect, useRef, useState } from 'react';
import { ResourceList, ResourceEditor } from './CatalogueResource';
import { resources } from './resources';
import FormationEditor from './FormationEditor';
import SessionEditor from './SessionEditor';
import SessionList from './SessionList';
import Inscriptions from './Inscriptions';
import DossierAdministratif from './DossierAdministratif';
import './admin.css';


export default function AdminWorkspace({ user, onLogout, busy, error }) {
  const [dirty, setDirty] = useState(false);
  const [documentNavigationOpen,setDocumentNavigationOpen]=useState(false);
  const allowExit = useRef(false);
  const [exit, setExit] = useState(null);
  const parts = window.location.pathname.replace(/\/+$/, '').split('/').slice(1);
  const kind = parts[1] === 'catalogue' && resources[parts[2]] ? parts[2] : null;
  const presences = kind === 'sessions' && parts[3] && parts[4] === 'presences' && parts.length === 5;
  const contenuPedagogique = kind === 'formations' && parts[3] && parts[4] === 'contenu' && parts.length === 5;
  const editing = kind && (parts[3] === 'nouveau' || (parts[3] && parts[4] === 'modifier'));
  const id = editing && parts[3] !== 'nouveau' ? decodeURIComponent(parts[3]) : undefined;
  const questionnaires = parts[1] === 'questionnaires' && parts.length <= 3;
  const documents=parts[1]==='suivi-documents' && parts.length<=3;
  const dashboard = parts.length === 1;
  const organisme = parts[1] === 'organisme' && parts.length === 2;
  const dossier = parts[1] === 'inscriptions' && parts.length === 4 && parts[3] === 'dossier';
  const inscriptions = parts[1] === 'inscriptions' && (parts.length <= 3 || dossier);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { if (!allowExit.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { document.title = `${documents ? 'Suivi des documents' : presences ? 'Présences de la session' : contenuPedagogique ? 'Contenu pédagogique' : organisme ? 'Organisme' : questionnaires ? 'Questionnaires' : dossier ? 'Dossier administratif' : inscriptions ? 'Inscriptions' : kind ? resources[kind].title : 'Tableau de bord'} — Administration CMH Academy`; }, [kind, inscriptions, dossier, questionnaires, organisme, contenuPedagogique, presences, documents]);
  async function logout() {
    if (dirty) { setExit({ logout: true }); return; }
    allowExit.current = true;
    const ok = await onLogout(); if (!ok) allowExit.current = false;
  }
  function navigate(event) {
    const link = event.target.closest('a[href]');
    if (!dirty || !link || link.hasAttribute('download') || link.target === '_blank' || link.hash || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setExit({ href: link.href });
  }
  async function leave() {
    const destination = exit; setExit(null);
    allowExit.current = true;
    if (destination.href) window.location.assign(destination.href);
    else { const ok = await onLogout(); if (!ok) allowExit.current = false; }
  }
  return <div className="admin-workspace" onClickCapture={navigate}>
    {exit && <ExitDialog onStay={() => setExit(null)} onLeave={leave} />}
    <a className="skip-link" href="#admin-content">Aller au contenu</a>
    <aside className="admin-sidebar"><a className="admin-brand" href="/admin">CMH <span>Academy</span></a><p className="admin-context">Administration</p>
      <button type="button" className="document-navigation-toggle admin-button secondary" aria-label="Navigation administrative" aria-expanded={documentNavigationOpen} aria-controls="admin-navigation" onClick={()=>setDocumentNavigationOpen(v=>!v)} hidden={!documents}>Navigation <span aria-hidden="true">⌄</span></button><nav id="admin-navigation" className={documents?'document-route-navigation'+(documentNavigationOpen?' is-open':''):undefined} aria-label="Administration"><a href="/admin/suivi-documents" aria-current={documents?"page":undefined}>Suivi des documents</a><a href="/admin" aria-current={dashboard ? 'page' : undefined}>Tableau de bord</a><a href="/admin/inscriptions" aria-current={inscriptions ? 'page' : undefined}>Inscriptions</a><a href="/admin/questionnaires" aria-current={questionnaires ? 'page' : undefined}>Questionnaires</a><p className="admin-nav-heading">Catalogue</p>
        {Object.entries(resources).map(([key, config]) => <a key={key} href={`/admin/catalogue/${key}`} aria-current={kind === key ? 'page' : undefined}>{config.title}</a>)}
        <a href="/admin/organisme" aria-current={organisme ? 'page' : undefined}>Organisme</a>
      </nav><div className="admin-account"><p>{user.email}</p><button className="admin-button secondary" onClick={logout} disabled={busy}>{busy ? 'Déconnexion…' : 'Se déconnecter'}</button><a href="/">Voir le catalogue public</a></div>
    </aside>
    <main className="admin-content" id="admin-content">{error && <p className="admin-notice error" role="alert">{error}</p>}
      {dirty && <p className="admin-notice" role="status">Modifications non enregistrées</p>}
      {documents ? <SuiviDocuments id={parts[2]} setDirty={setDirty}/> : organisme ? <OrganismeAttestation setDirty={setDirty} /> : questionnaires ? <QuestionnaireModeles id={parts[2]} setDirty={setDirty} /> : inscriptions ? (dossier ? <DossierAdministratif id={parts[2]} setDirty={setDirty} /> : <Inscriptions id={parts[2]} />) :
      kind ? (contenuPedagogique ? <ContenuPedagogique id={parts[3]} setDirty={setDirty} /> : presences ? <SessionPresences id={parts[3]} setDirty={setDirty} /> : editing ? (kind === 'formations' ? <FormationEditor id={id} setDirty={setDirty} /> : kind === 'sessions' ? <SessionEditor id={id} setDirty={setDirty} /> : <ResourceEditor kind={kind} id={id} setDirty={setDirty} />) : kind === 'sessions' ? <SessionList /> : <ResourceList kind={kind} />) : dashboard ? <>
        <div className="admin-page-heading"><div><p className="eyebrow">Votre espace</p><h1>Tableau de bord</h1><p>Gérez les formations, leurs sessions, les pôles et les fiches formateurs du catalogue.</p></div></div>
        <div className="admin-dashboard">{Object.entries(resources).map(([key, config]) => <section className="admin-panel" key={key}><h2>{config.title}</h2><p>{config.description}</p><a className="admin-button secondary" href={`/admin/catalogue/${key}`}>Gérer les {config.title.toLowerCase()}</a></section>)}</div>
      </> : <section className="admin-panel"><h1>Page introuvable</h1><a href="/admin">Retour au tableau de bord</a></section>}
    </main>
  </div>;
}
