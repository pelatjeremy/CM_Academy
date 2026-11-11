import {useCallback,useEffect,useRef,useState} from 'react';
import {adminRequest} from './api';
import {formatParis} from './session-time';
import {Confirmation} from '../questionnaires/QuestionnaireCommun';
import {etatsPresence,dureePresence} from '../presences/presence-labels';
import PresenceHistorique from '../presences/PresenceHistorique';
const valuesOf=row=>({etat:row?.etat||'NON_RENSEIGNE',minutes:row?.etat==='PARTIEL'?String(row.dureeSuivieMs/60000):'',motif:''});
function Releve({inscription,seance,onDirty}){
 const original=inscription.presences.find(p=>p.seanceId===seance.id)||null;
 const [item,setItem]=useState(original),[values,setValues]=useState(()=>valuesOf(original)),[baseline,setBaseline]=useState(()=>valuesOf(original)),[error,setError]=useState(''),[fields,setFields]=useState({}),[success,setSuccess]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[conflict,setConflict]=useState(false);
 const lock=useRef(false),key=inscription.id+'-'+seance.id;
 const dirty=values.etat!==baseline.etat||values.minutes!==baseline.minutes;
 const readonly=inscription.statut!=='CONFIRMEE',future=new Date(seance.debut)>new Date();
 useEffect(()=>{onDirty(key,dirty);return()=>onDirty(key,false);},[key,dirty,onDirty]);
 function change(name,value){setValues(previous=>({...previous,[name]:value,...(name==='etat'&&value!=='PARTIEL'?{minutes:''}:{})}));setFields(previous=>({...previous,[name]:undefined,minutesPartielles:undefined}));setSuccess('');}
 function submit(event){
  event.preventDefault();const errors={};
  const duration=new Date(seance.fin)-new Date(seance.debut);
  if(values.etat==='PARTIEL'&&(!/^\d+$/.test(values.minutes)||Number(values.minutes)<=0||Number(values.minutes)*60000>=duration))errors.minutesPartielles='Minutes entières strictement entre zéro et la durée programmée.';
  if(item&&dirty&&!values.motif.trim())errors.motif='Un motif de correction est obligatoire.';
  setFields(errors);if(Object.keys(errors).length)return;setConfirm(true);
 }
 async function save(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setSuccess('');
  try{
   const data=await adminRequest('/api/admin/inscriptions/'+inscription.id+'/seances/'+seance.id+'/presence',{method:'PUT',body:JSON.stringify({etat:values.etat,minutesPartielles:values.etat==='PARTIEL'?Number(values.minutes):null,revision:item?.revision??null,debutAttendu:seance.debut,finAttendue:seance.fin,motif:values.motif})});
   setItem(data.item);const next=valuesOf(data.item);setValues(next);setBaseline(next);onDirty(key,false);setSuccess(data.message);
  }catch(err){setError(err.message);setFields(err.fields||{});if(err.status===409)setConflict(true);}
  finally{setBusy(false);lock.current=false;setConfirm(false);}
 }
 const nom=inscription.prenom+' '+inscription.nom;
 return <article className="admin-seance"><h3>{nom}</h3>
  {readonly?<p>Inscription {inscription.statut==='ANNULEE'?'annulée':'non confirmée'} : historique conservé en lecture seule.</p>:future?<p>La séance n’a pas encore commencé. La saisie sera disponible après son début.</p>:null}
  <p>État enregistré : {etatsPresence[item?.etat||'NON_RENSEIGNE']} · {dureePresence(item?.dureeSuivieMs??null)}</p>
  {confirm&&<Confirmation titre={item?'Confirmer la correction ?':'Enregistrer la présence ?'} message="Présence renseignée manuellement. Les anciennes valeurs, la date et l’auteur seront conservés ; aucun état documentaire ne sera validé." confirmer={item?'Enregistrer la correction':'Enregistrer la présence'} onConfirm={save} onCancel={()=>setConfirm(false)} busy={busy}/>}
  {error&&<div className="admin-notice error" role="alert"><p>{error}</p><a href={window.location.pathname}>Recharger les relevés</a></div>}{success&&<p className="admin-notice success" role="status">{success}</p>}
  {!readonly&&<form onSubmit={submit} noValidate><fieldset className="questionnaire-fields" disabled={busy||future}><legend className="sr-only">Présence de {nom}</legend>
   <label className="admin-label" htmlFor={key+'-etat'}>État de présence de {nom}</label><select className="admin-input" id={key+'-etat'} value={values.etat} onChange={e=>change('etat',e.target.value)}>{Object.entries(etatsPresence).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{fields.etat&&<p role="alert">{fields.etat}</p>}
   {values.etat==='PARTIEL'&&<><label className="admin-label" htmlFor={key+'-minutes'}>Minutes réellement suivies par {nom}</label><input className="admin-input" id={key+'-minutes'} inputMode="numeric" value={values.minutes} maxLength={10} onChange={e=>change('minutes',e.target.value)} aria-invalid={!!fields.minutesPartielles}/><p>Strictement entre zéro et {((new Date(seance.fin)-new Date(seance.debut))/60000).toLocaleString('fr-FR')} minutes.</p>{fields.minutesPartielles&&<p role="alert">{fields.minutesPartielles}</p>}</>}
   {item&&dirty&&<><label className="admin-label" htmlFor={key+'-motif'}>Motif de correction pour {nom}</label><textarea className="admin-input" id={key+'-motif'} rows={2} maxLength={500} value={values.motif} onChange={e=>change('motif',e.target.value)} aria-invalid={!!fields.motif}/>{fields.motif&&<p role="alert">{fields.motif}</p>}</>}
   <p>Présent = durée complète ; Absent = zéro ; Non renseigné = durée inconnue.</p>
   <button className="admin-button" disabled={busy||future||conflict||!dirty}>{busy?'Enregistrement…':item?'Enregistrer la correction':'Enregistrer la présence'}</button>
  </fieldset></form>}
  {item&&<PresenceHistorique item={item}/>}
 </article>;
}
export default function SessionPresences({id,setDirty}){
 const [state,setState]=useState({loading:true}),[attempt,setAttempt]=useState(0),pending=useRef(new Set());
 const onDirty=useCallback((key,value)=>{if(value)pending.current.add(key);else pending.current.delete(key);setDirty(pending.current.size>0);},[setDirty]);
 useEffect(()=>{const controller=new AbortController();adminRequest('/api/admin/sessions/'+id+'/presences',{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setState({data});}).catch(err=>{if(!controller.signal.aborted)setState({error:err.message});});return()=>controller.abort();},[id,attempt]);
 const item=state.data?.item,confirmees=item?.inscriptions.filter(i=>i.statut==='CONFIRMEE')||[],historiques=item?.inscriptions.filter(i=>i.statut!=='CONFIRMEE')||[];
 return <section><a href={'/admin/catalogue/sessions/'+id+'/modifier'}>← Session</a><h1>Présences {item?'— '+item.formation.titre:''}</h1><p>Présence renseignée manuellement. Horaires Europe/Paris. Les relevés ne constituent pas une signature d’émargement.</p>
  <p>Dès qu’un relevé existe, les horaires et la durée de la séance sont verrouillés, même si ce relevé revient à Non renseigné.</p>
  {state.loading&&<p role="status">Chargement des séances et inscriptions…</p>}{state.error&&<div role="alert"><p>{state.error}</p><button className="admin-button secondary" onClick={()=>setAttempt(n=>n+1)}>Réessayer</button></div>}
  {item&&<>{!item.seances.length?<p>Aucune séance programmée.</p>:!confirmees.length?<p>Aucune inscription confirmée.</p>:<h2>Inscriptions confirmées</h2>}
   {item.seances.map(seance=><section className="admin-panel" key={seance.id}><h2>{formatParis(seance.debut)} → {formatParis(seance.fin)}</h2><p>Durée programmée : {dureePresence(new Date(seance.fin)-new Date(seance.debut))}</p>
    {confirmees.map(inscription=><Releve key={inscription.id} inscription={inscription} seance={seance} onDirty={onDirty}/>)}
    {!!historiques.filter(i=>i.presences.some(p=>p.seanceId===seance.id)).length&&<h3>Historique des inscriptions non confirmées</h3>}
    {historiques.filter(i=>i.presences.some(p=>p.seanceId===seance.id)).map(inscription=><Releve key={inscription.id} inscription={inscription} seance={seance} onDirty={onDirty}/>)}
   </section>)}
  </>}
 </section>;
}
