import {useEffect,useState} from 'react';
import {adminRequest} from '../admin/api';
import {etatsQuestionnaire,categoriesQuestionnaire} from '../questionnaires/labels';
export default function QuestionnairesInscription({id}){
 const [state,setState]=useState({loading:true}),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();adminRequest('/api/stagiaire/inscriptions/'+id+'/questionnaires',{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setState({data});}).catch(err=>{if(!controller.signal.aborted)setState({error:err.message});});return()=>controller.abort();},[id,attempt]);
 return <section className="admin-panel"><h2>Mes questionnaires</h2><p>Vos réponses sont nominatives et consultables par l’administration.</p>
 {state.loading&&<p role="status">Chargement…</p>}{state.error&&<div role="alert"><p>{state.error}</p><button className="admin-button secondary" onClick={()=>setAttempt(n=>n+1)}>Réessayer</button></div>}
 {state.data&&(!state.data.items.length?<p>Aucun questionnaire attribué.</p>:<ul className="admin-resource-list">{state.data.items.map(item=><li key={item.id}><div><h3><a href={'/stagiaire/inscriptions/'+id+'/questionnaires/'+item.id}>{item.titre}</a></h3><p>{categoriesQuestionnaire[item.categorie]}</p></div><span className="admin-badge">{etatsQuestionnaire[item.etat]}</span></li>)}</ul>)}
 </section>;
}
