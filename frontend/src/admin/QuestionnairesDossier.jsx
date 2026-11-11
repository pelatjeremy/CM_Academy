import {useEffect,useRef,useState} from 'react';
import {adminRequest} from './api';
import {formatParis} from './session-time';
import {categoriesQuestionnaire,etatsQuestionnaire} from '../questionnaires/labels';
import {Confirmation,QuestionsReponses} from '../questionnaires/QuestionnaireCommun';
export default function QuestionnairesDossier({id,identite}){
 const base='/api/admin/inscriptions/'+encodeURIComponent(id)+'/questionnaires';
 const [state,setState]=useState({loading:true}),[modeles,setModeles]=useState(null),[params,setParams]=useState({q:'',page:1}),[selection,setSelection]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[retrait,setRetrait]=useState(null),[attempt,setAttempt]=useState(0);
 const requete=useRef(null),lock=useRef(false);
 useEffect(()=>{let live=true;adminRequest(base).then(data=>{if(live)setState({data});}).catch(err=>{if(live)setState({error:err.message});});return()=>{live=false;};},[base,attempt]);
 useEffect(()=>{let live=true;adminRequest('/api/admin/questionnaires/modeles?valide=true&'+new URLSearchParams(params)).then(data=>{if(live)setModeles(data);}).catch(err=>{if(live)setError(err.message);});return()=>{live=false;};},[params]);
 async function attribuer(event){
  event.preventDefault();if(lock.current||!selection)return;lock.current=true;setBusy(true);setError('');setSuccess('');
  const modele=modeles?.items.find(m=>m.id===selection);
  if(!modele){setBusy(false);lock.current=false;return;}
  if(!requete.current)requete.current=crypto.randomUUID();
  try{await adminRequest(base,{method:'POST',body:JSON.stringify({modeleId:modele.id,modeleRevision:modele.revision,requeteId:requete.current})});requete.current=null;setSelection('');setState({data:await adminRequest(base)});setSuccess('Questionnaire attribué. Les questions sont figées pour cette inscription.');}
  catch(err){setError(err.message);}finally{setBusy(false);lock.current=false;}
 }
 async function retirer(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setSuccess('');
  try{await adminRequest(base+'/'+retrait.id+'/retirer',{method:'POST',body:JSON.stringify({revision:retrait.revision})});setState({data:await adminRequest(base)});setSuccess('Questionnaire retiré. Sa trace est conservée.');}
  catch(err){setError(err.message);}finally{setRetrait(null);setBusy(false);lock.current=false;}
 }
 return <section className="admin-panel"><h2>Questionnaires nominatifs</h2><p>Les réponses sont associées à {identite}. Ce suivi ne modifie aucun état documentaire manuel. La satisfaction à froid s’attribue ici manuellement.</p>
  {retrait&&<Confirmation titre="Retirer ce questionnaire ?" message="Le stagiaire ne pourra plus le compléter. L’attribution et son retrait resteront dans le dossier." confirmer="Retirer le questionnaire" onConfirm={retirer} onCancel={()=>setRetrait(null)} busy={busy}/>}
  {state.loading&&<p role="status">Chargement des questionnaires…</p>}{state.error&&<div role="alert">{state.error} <button type="button" className="admin-button secondary" onClick={()=>setAttempt(n=>n+1)}>Réessayer</button></div>}
  {error&&<p className="admin-notice error" role="alert">{error}</p>}{success&&<p className="admin-notice success" role="status">{success}</p>}
  <form onSubmit={e=>{e.preventDefault();setSelection('');requete.current=null;setParams({q:new FormData(e.currentTarget).get('q'),page:1});}}><label className="admin-label" htmlFor="questionnaire-modele-recherche">Rechercher un modèle validé</label><div className="admin-actions"><input className="admin-input" id="questionnaire-modele-recherche" name="q" maxLength={160}/><button className="admin-button secondary" disabled={busy}>Rechercher</button></div></form>
  {!modeles?<p>Chargement des modèles…</p>:<><form onSubmit={attribuer}><label className="admin-label" htmlFor="questionnaire-modele">Modèle à attribuer</label><select className="admin-input" id="questionnaire-modele" value={selection} disabled={busy} onChange={e=>{setSelection(e.target.value);requete.current=null;}}><option value="">Choisir un modèle validé</option>{modeles.items.map(m=><option key={m.id} value={m.id}>{m.titre} · {categoriesQuestionnaire[m.categorie]}</option>)}</select><button className="admin-button" disabled={busy||!selection}>{busy?'Enregistrement…':'Attribuer le questionnaire'}</button></form>
   {!modeles.items.length&&<p>Aucun modèle validé correspondant. <a href="/admin/questionnaires">Gérer les modèles</a></p>}
   {modeles.total>20&&<nav className="admin-pagination" aria-label="Pagination des modèles à attribuer"><button type="button" className="admin-button secondary" disabled={params.page===1||busy} onClick={()=>{setSelection('');requete.current=null;setParams(p=>({...p,page:p.page-1}));}}>Précédent</button><span>Page {params.page}</span><button type="button" className="admin-button secondary" disabled={params.page*20>=modeles.total||busy} onClick={()=>{setSelection('');requete.current=null;setParams(p=>({...p,page:p.page+1}));}}>Suivant</button></nav>}</>}
  {state.data&&(!state.data.items.length?<p>Aucun questionnaire attribué.</p>:state.data.items.map(item=><article className="admin-seance" key={item.id}><h3>{item.titre}</h3><p><span className="admin-badge">{etatsQuestionnaire[item.etat]}</span> · {categoriesQuestionnaire[item.categorie]}</p><p>Attribué le {formatParis(item.createdAt)} par {item.auteur.email} · version du modèle {item.modeleRevision}</p>
   {item.retireAt&&<p>Retiré le {formatParis(item.retireAt)} par {item.retirePar.email}.</p>}
   {item.soumisAt&&<><p>Réponses nominatives de {identite}, envoyées le {formatParis(item.soumisAt)} par {item.soumisPar.email}.</p><details><summary>Consulter les réponses soumises</summary><QuestionsReponses questions={item.questions} values={item.reponses} readonly/></details></>}
   {['A_COMPLETER','BROUILLON'].includes(item.etat)&&<button type="button" className="admin-button secondary" disabled={busy} onClick={()=>setRetrait(item)}>Retirer le questionnaire</button>}
  </article>))}
 </section>;
}
