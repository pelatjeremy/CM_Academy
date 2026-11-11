import {useEffect,useState} from 'react';
import {adminRequest} from '../admin/api';
import VideoPlayer from './VideoPlayer';

export default function ParcoursPedagogique({inscriptionId,formationId,leconId,admin=false}){
 const base=admin?'/api/admin/formations/'+encodeURIComponent(formationId)+'/contenu':'/api/stagiaire/inscriptions/'+encodeURIComponent(inscriptionId)+'/parcours';
 const [state,setState]=useState({loading:true}),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{const c=new AbortController();Promise.all([adminRequest(base,{signal:c.signal}),!admin&&leconId?adminRequest(base+'/lecons/'+encodeURIComponent(leconId),{signal:c.signal}):Promise.resolve(null)]).then(([data,lesson])=>{if(!c.signal.aborted)setState({data,lesson:lesson?.item});}).catch(e=>{if(!c.signal.aborted)setState({error:e.message,status:e.status});});return()=>c.abort();},[base,leconId,admin,attempt]);
 function link(id){return admin?'/admin/catalogue/formations/'+encodeURIComponent(formationId)+'/contenu?apercu=1'+(id?'&lecon='+encodeURIComponent(id):''):'/stagiaire/inscriptions/'+encodeURIComponent(inscriptionId)+'/parcours'+(id?'/'+encodeURIComponent(id):'');}
 async function progression(){if(busy)return;setBusy(true);setError('');setMessage('');try{const data=await adminRequest(base+'/lecons/'+encodeURIComponent(leconId)+'/progression',{method:'PUT',body:JSON.stringify({terminee:!state.lesson.progression.terminee,revision:state.lesson.progression.revision})});setState(s=>({...s,lesson:{...s.lesson,progression:data.item}}));setMessage(data.message);setAttempt(n=>n+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
 if(state.loading)return <p role="status">Chargement du parcours pédagogique…</p>;
 if(state.error)return <section className="admin-panel"><p role="alert">{state.error}</p><button className="admin-button secondary" onClick={()=>{setState({loading:true});setAttempt(n=>n+1);}}>Réessayer</button><a href={admin?'/admin/catalogue/formations/'+formationId+'/contenu':'/stagiaire'}>Retour</a>{state.status===401&&<p><a href={admin?'/admin/connexion':'/stagiaire/connexion'}>Se reconnecter</a></p>}</section>;
 const data=state.data,lessons=data.modules.flatMap(m=>m.lecons),index=lessons.findIndex(l=>l.id===leconId),lesson=admin?lessons[index]:state.lesson;
 return <section className="admin-panel pedagogy-reader">
  {admin&&<p className="admin-notice warning" role="status"><strong>Aperçu administrateur</strong> · Les brouillons et archives sont visibles ici. Cette vue ne donne aucun droit stagiaire.</p>}
  <h2>Parcours pédagogique · {data.formation.titre}</h2>
  <p>Modules et leçons d’étude, distincts des séances datées de votre session.</p>
 {!admin&&<><p className="admin-count" role="status">{data.progression.terminees} leçon{data.progression.terminees>1?'s':''} terminée{data.progression.terminees>1?'s':''} sur {data.progression.total} accessible{data.progression.total>1?'s':''}</p><p>Progression déclarée par le stagiaire. Elle ne valide ni présence, ni acquis, ni attestation. Le total comprend uniquement les leçons publiées de modules publiés, hors archives. Les déclarations des contenus retirés sont conservées.</p></>}
  {leconId?<><a href={link()}>← Sommaire du parcours</a>{!lesson?<p role="alert">Leçon introuvable dans ce parcours.</p>:<article>
   <h3>{lesson.titre}</h3>{admin&&<p className="admin-badge">{lesson.archive?'Archivée':lesson.publie?'Publiée':'Brouillon'}</p>}
   <div className="pedagogy-text">{lesson.contenu||'Contenu à préparer.'}</div>
   <h4>Vidéos et replays</h4>{!(lesson.videos||[]).filter(v=>!v.retireAt).length?<p>Aucune vidéo disponible pour cette leçon.</p>:(lesson.videos||[]).filter(v=>!v.retireAt).map(video=><VideoPlayer key={lesson.id+'/'+video.id} video={video} base={base+'/lecons/'+lesson.id+'/videos'}/>)}
   <h4>Supports PDF</h4>{!lesson.supports.length?<p>Aucun support PDF.</p>:<ul className="admin-file-versions">{lesson.supports.map(file=><li key={file.id}>{file.archive&&<span className="admin-badge">Archivé · </span>}<a download href={base+'/lecons/'+lesson.id+'/supports/'+file.id+'/telecharger'}>{file.nomOriginal}</a><p>{Math.ceil(file.taille/1024)} Ko · PDF</p></li>)}</ul>}
   {!admin&&<><p>État déclaré : {lesson.progression.terminee?'Terminée':'À étudier'}</p><button className="admin-button" disabled={busy} onClick={progression}>{busy?'Enregistrement…':lesson.progression.terminee?'Reprendre mon étude':'Marquer comme terminée'}</button>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</>}
   <nav className="admin-actions pedagogy-pagination" aria-label="Navigation des leçons">{index>0&&<a href={link(lessons[index-1].id)}>← Leçon précédente</a>}{index>=0&&index<lessons.length-1&&<a href={link(lessons[index+1].id)}>Leçon suivante →</a>}</nav>
  </article>}</>:<>
   {!data.modules.length?<p>Aucun module accessible pour le moment.</p>:<ol className="pedagogy-outline">{data.modules.map(m=><li key={m.id}><h3>{m.titre}</h3>{admin&&<span className="admin-badge">{m.archive?'Archivé':m.publie?'Publié':'Brouillon'}</span>}{!m.lecons.length?<p>Aucune leçon accessible dans ce module.</p>:<ol>{m.lecons.map(l=><li key={l.id}><a href={link(l.id)}>{l.titre}</a>{admin?<span className="admin-badge">{l.archive?'Archivée':l.publie?'Publiée':'Brouillon'}</span>:<span> · {l.progression.terminee?'Terminée':'À étudier'}</span>}</li>)}</ol>}</li>)}</ol>}
  </>}
 </section>;
}
