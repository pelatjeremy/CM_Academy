import PresenceSynthese from '../presences/PresenceSynthese';
import ParcoursPedagogique from '../pedagogie/ParcoursPedagogique';
import ExitDialog from '../components/ExitDialog';
import QuestionnairesInscription from './QuestionnairesInscription';
import QuestionnaireReponses from './QuestionnaireReponses';
import {useEffect,useRef,useState} from 'react';
import {adminRequest} from '../admin/api';
import {formatParis} from '../admin/session-time';
import {statutsInscription,categories} from '../admin/dossier-labels';
import '../admin/admin.css';
export default function EspaceStagiaire({user,onLogout,busy,error}){
 const match=window.location.pathname.match(/^\/stagiaire\/inscriptions\/([^/]+)(?:\/(questionnaires|parcours)(?:\/([^/]+))?)?$/);
 const id=match?.[1],questionnaireId=match?.[2]==='questionnaires'?match[3]:null,parcours=match?.[2]==='parcours',leconId=parcours?match?.[3]:null;
 const [dirty,setDirty]=useState(false),[exit,setExit]=useState(null);const allowExit=useRef(false);
 useEffect(()=>{if(!dirty)return;const warn=e=>{if(!allowExit.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 function navigate(e){const link=e.target.closest('a[href]');if(!dirty||!link||link.hasAttribute('download')||link.hash||link.target==='_blank'||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();setExit({href:link.href});}
 async function logout(){if(dirty){setExit({logout:true});return;}await onLogout();}
 async function leave(){const next=exit;setExit(null);allowExit.current=true;if(next.href)window.location.assign(next.href);else{const ok=await onLogout();if(!ok)allowExit.current=false;}}

 const [state,setState]=useState({loading:true}),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  document.title='Mes formations — CMH Academy';
  const controller=new AbortController();
  adminRequest('/api/stagiaire/inscriptions'+(id?'/'+encodeURIComponent(id):''),{signal:controller.signal})
   .then(data=>{if(!controller.signal.aborted)setState({data});})
   .catch(err=>{if(!controller.signal.aborted)setState({error:err.message});});
  return()=>controller.abort();
 },[id,attempt]);
 return <div className="admin-workspace" onClickCapture={navigate}>
  {exit&&<ExitDialog onStay={()=>setExit(null)} onLeave={leave}/>}
  <a className="skip-link" href="#stagiaire-content">Aller au contenu</a>
  <aside className="admin-sidebar"><a className="admin-brand" href="/stagiaire">CMH <span>Academy</span></a><p>Espace stagiaire</p>
   <nav aria-label="Espace stagiaire"><a href="/stagiaire" aria-current={!id?'page':undefined}>Mes formations</a></nav>
   <div className="admin-account"><p>{user.email}</p><button className="admin-button secondary" disabled={busy} onClick={logout}>Se déconnecter</button><a href="/">Catalogue public</a></div>
  </aside>
  <main className="admin-content" id="stagiaire-content"><h1>{state.data?.item?.session.formation.titre||'Mes formations'}</h1>
   {id&&<a href="/stagiaire">← Mes formations</a>}
   {error&&<p role="alert">{error}</p>}
   {state.loading&&<p role="status">Chargement…</p>}
   {state.error&&<div role="alert"><p>{state.error}</p><button className="admin-button" onClick={()=>{setState({loading:true});setAttempt(n=>n+1);}}>Réessayer</button> <a href="/stagiaire/connexion">Se reconnecter</a></div>}
   {state.data?.items&&<section className="admin-panel">{!state.data.items.length?<p>Aucune formation n’est encore rattachée à votre compte.</p>:<ul className="admin-resource-list">{state.data.items.map(item=><li key={item.id}><div><h2><a href={'/stagiaire/inscriptions/'+item.id}>{item.session.formation.titre}</a></h2><p>{statutsInscription[item.statut]}</p>{item.session.seances[0]&&<p>{formatParis(item.session.seances[0].debut)}</p>}</div></li>)}</ul>}</section>}
   {state.data?.item&&(parcours?<ParcoursPedagogique inscriptionId={id} leconId={leconId}/>:questionnaireId?<QuestionnaireReponses inscriptionId={id} id={questionnaireId} setDirty={setDirty}/>:<>
    {state.data.item.statut==='CONFIRMEE'&&<p><a className="admin-button" href={'/stagiaire/inscriptions/'+id+'/parcours'}>Ouvrir le parcours pédagogique</a></p>}
    <PresenceSynthese id={id}/>
    <QuestionnairesInscription id={id}/>
    <section className="admin-panel"><h2>Votre session</h2><p>Statut : {statutsInscription[state.data.item.statut]}</p><p>{state.data.item.session.formation.description}</p>
    {state.data.item.session.lieu&&<p>Lieu : {state.data.item.session.lieu}</p>}<p>{state.data.item.session.modalitesPratiques}</p>
    <h3>Séances — heure de Paris</h3>{!state.data.item.session.seances.length?<p>Les horaires seront précisés prochainement.</p>:<ul>{state.data.item.session.seances.map(seance=><li key={seance.id}>{formatParis(seance.debut)} → {formatParis(seance.fin)}</li>)}</ul>}</section>
    <section className="admin-panel"><h2>Documents partagés</h2>{!state.data.fichiers.length?<p>Aucun document n’a encore été partagé.</p>:<ul className="admin-file-versions">{state.data.fichiers.map(file=><li key={file.id}><p>{categories[file.categorie]} · version {file.version}</p><a download href={'/api/stagiaire/inscriptions/'+id+'/fichiers/'+file.id+'/telecharger'}>{file.nomOriginal}</a><p>{Math.ceil(file.taille/1024)} Ko · {file.typeMime} · {formatParis(file.date)}</p></li>)}</ul>}</section>
   </>)}
  </main>
 </div>;
}
