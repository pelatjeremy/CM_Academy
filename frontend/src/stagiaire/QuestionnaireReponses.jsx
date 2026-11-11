import {useEffect,useRef,useState} from 'react';
import {adminRequest} from '../admin/api';
import {formatParis} from '../admin/session-time';
import {Confirmation,QuestionsReponses} from '../questionnaires/QuestionnaireCommun';
import {etatsQuestionnaire,reponsesObligatoires} from '../questionnaires/labels';
export default function QuestionnaireReponses({inscriptionId,id,setDirty}){
 const base='/api/stagiaire/inscriptions/'+inscriptionId+'/questionnaires/'+id;
 const [item,setItem]=useState(null),[values,setValues]=useState({}),[baseline,setBaseline]=useState({}),[state,setState]=useState({loading:true}),[error,setError]=useState(''),[fields,setFields]=useState({}),[busy,setBusy]=useState(false),[success,setSuccess]=useState(''),[confirm,setConfirm]=useState(''),[attempt,setAttempt]=useState(0),[conflict,setConflict]=useState(false);
 const lock=useRef(false),dirty=JSON.stringify(values)!==JSON.stringify(baseline);
 useEffect(()=>{setDirty(dirty);},[dirty,setDirty]);
 useEffect(()=>{
  const controller=new AbortController();adminRequest(base,{signal:controller.signal}).then(data=>{
   if(!controller.signal.aborted){setItem(data.item);setValues(data.item.reponses);setBaseline(data.item.reponses);setState({});}
  }).catch(err=>{if(!controller.signal.aborted)setState({error:err.message});});return()=>controller.abort();
 },[base,attempt]);
 function change(key,value){setValues(previous=>({...previous,[key]:value}));setFields(previous=>({...previous,[key]:undefined}));setSuccess('');}
 async function save(submit=false){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setFields({});
  try{
   const data=await adminRequest(base+(submit?'/soumettre':'/brouillon'),{method:submit?'POST':'PUT',body:JSON.stringify({revision:item.revision,reponses:values})});
   setItem(data.item);setValues(data.item.reponses);setBaseline(data.item.reponses);setDirty(false);setSuccess(data.message);
  }catch(err){setError(err.message);setFields(err.fields||{});if(err.status===409)setConflict(true);}
  finally{setBusy(false);lock.current=false;setConfirm('');}
 }
 function submit(event){
  event.preventDefault();const errors=reponsesObligatoires(item.questions,values);setFields(errors);
  if(Object.keys(errors).length){setError('Renseignez les réponses obligatoires avant l’envoi.');document.getElementById('reponse-'+Object.keys(errors)[0])?.focus();return;}
  setConfirm('envoyer');
 }
 function reload(){setDirty(false);setItem(null);setValues({});setBaseline({});setFields({});setState({loading:true});setConflict(false);setError('');setSuccess('');setConfirm('');setAttempt(n=>n+1);}
 const readonly=item&&['ENVOYE','RETIRE'].includes(item.etat);
 return <section><a href={'/stagiaire/inscriptions/'+inscriptionId}>← Retour à ma formation</a><h2>{item?.titre||'Questionnaire'}</h2><p>Réponses nominatives, consultables par l’administration.</p>
  {state.loading&&<p role="status">Chargement du questionnaire…</p>}{state.error&&<div role="alert"><p>{state.error}</p><button className="admin-button secondary" onClick={()=>setAttempt(n=>n+1)}>Réessayer</button> <a href="/stagiaire/connexion">Se reconnecter</a></div>}
  {dirty&&<p className="admin-notice" role="status">Modifications non enregistrées</p>}
  {error&&<div className="admin-notice error" role="alert"><p>{error}</p>{conflict&&<button type="button" className="admin-button secondary" onClick={()=>setConfirm('recharger')}>Recharger la version enregistrée</button>}<a href="/stagiaire/connexion">Se reconnecter si la session a expiré</a></div>}
  {success&&<p className="admin-notice success" role="status">{success}</p>}
  {confirm&&<Confirmation titre={confirm==='envoyer'?'Envoyer définitivement vos réponses ?':'Remplacer vos saisies ?'} message={confirm==='envoyer'?'Après cet envoi, vos réponses nominatives seront en lecture seule.':'Vos saisies actuelles seront remplacées par la version enregistrée. Annulez pour les conserver.'} confirmer={confirm==='envoyer'?'Envoyer définitivement':'Recharger'} onConfirm={()=>confirm==='envoyer'?save(true):reload()} onCancel={()=>setConfirm('')} busy={busy}/>}
  {item&&<div className="admin-panel"><p>État : {etatsQuestionnaire[item.etat]}</p>{item.soumisAt&&<p>Envoyé le {formatParis(item.soumisAt)}.</p>}{item.retireAt&&<p>Retiré le {formatParis(item.retireAt)}. Vous ne pouvez plus envoyer ce questionnaire.</p>}
   <form onSubmit={submit} noValidate><fieldset disabled={busy} className="questionnaire-fields"><legend className="sr-only">Vos réponses</legend><QuestionsReponses questions={item.questions} values={values} onChange={change} fields={fields} readonly={readonly}/></fieldset>
    {fields.reponses&&<p role="alert">{fields.reponses}</p>}
    {!readonly&&<div className="admin-actions"><button type="button" className="admin-button secondary" disabled={busy||conflict} onClick={()=>save(false)}>{busy?'Enregistrement…':'Enregistrer le brouillon'}</button><button className="admin-button" disabled={busy||conflict}>Envoyer mes réponses</button></div>}
   </form>
  </div>}
 </section>;
}
