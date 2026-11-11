import {useEffect,useRef,useState} from 'react';
import {adminRequest} from './api';
import {categoriesQuestionnaire,typesQuestion} from '../questionnaires/labels';
import {Confirmation} from '../questionnaires/QuestionnaireCommun';
const base='/api/admin/questionnaires/modeles';
const initial={titre:'',categorie:'POSITIONNEMENT',questions:[]};
export default function QuestionnaireModeles({id,setDirty}){
 const [item,setItem]=useState(null),[values,setValues]=useState(initial),[baseline,setBaseline]=useState(initial),[state,setState]=useState({loading:id!=='nouveau'}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[fields,setFields]=useState({}),[success,setSuccess]=useState(''),[confirm,setConfirm]=useState(false),[params,setParams]=useState({q:'',page:1});
 const lock=useRef(false),editing=id!==undefined,creating=id==='nouveau';
 const dirty=editing&&JSON.stringify(values)!==JSON.stringify(baseline);
 useEffect(()=>{setDirty(dirty);},[dirty,setDirty]);
 useEffect(()=>{
  if(creating)return;
  const controller=new AbortController();
  adminRequest(base+(editing?'/'+encodeURIComponent(id):'?'+new URLSearchParams(params)),{signal:controller.signal}).then(data=>{
   if(controller.signal.aborted)return;
   if(editing){const {titre,categorie,questions}=data.item;setItem(data.item);setValues({titre,categorie,questions});setBaseline({titre,categorie,questions});}
   setState({data});
  }).catch(err=>{if(!controller.signal.aborted)setState({error:err.message});});
  return()=>controller.abort();
 },[creating,editing,id,params]);
 function change(next){setValues(next);setSuccess('');setFields({});}
 function question(index,next){change({...values,questions:values.questions.map((q,i)=>i===index?next:q)});}
 function move(index,offset){const next=[...values.questions];[next[index],next[index+offset]]=[next[index+offset],next[index]];change({...values,questions:next});}
 async function save(event){
  event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');setFields({});
  try{
   const data=await adminRequest(base+(creating?'':'/'+id),{method:creating?'POST':'PUT',body:JSON.stringify({...values,...(!creating?{revision:item.revision}:{})})});
   if(creating){const next=(await adminRequest(base+'/'+data.item.id)).item;window.history.replaceState(null,'','/admin/questionnaires/'+data.item.id);setItem(next);setBaseline(values);setDirty(false);setSuccess('Modèle créé en brouillon.');return;}
   const next=(await adminRequest(base+'/'+id)).item;setItem(next);setBaseline(values);setSuccess('Brouillon enregistré. Validez-le avant attribution.');
  }catch(err){setError(err.message);setFields(err.fields||{});}finally{setBusy(false);lock.current=false;}
 }
 async function validate(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setFields({});
  try{await adminRequest(base+'/'+id+'/valider',{method:'POST',body:JSON.stringify({revision:item.revision})});setItem((await adminRequest(base+'/'+id)).item);setSuccess('Modèle validé et attribuable.');}
  catch(err){setError(err.message);setFields(err.fields||{});}finally{setBusy(false);lock.current=false;setConfirm(false);}
 }
 if(!editing)return <section><div className="admin-page-heading"><h1>Questionnaires</h1><a className="admin-button" href="/admin/questionnaires/nouveau">Créer un modèle</a></div>
  <div className="admin-panel"><form onSubmit={e=>{e.preventDefault();setState({loading:true});setParams({q:new FormData(e.currentTarget).get('q'),page:1});}}><label className="admin-label" htmlFor="modeles-recherche">Rechercher un modèle</label><div className="admin-actions"><input className="admin-input" id="modeles-recherche" name="q" maxLength={160}/><button className="admin-button secondary">Rechercher</button></div></form>
  {state.loading&&<p role="status">Chargement…</p>}{state.error&&<p role="alert">{state.error}</p>}
  {state.data&&<>{!state.data.items.length?<p>Aucun modèle de questionnaire.</p>:<ul className="admin-resource-list">{state.data.items.map(m=><li key={m.id}><div><h2><a href={'/admin/questionnaires/'+m.id}>{m.titre}</a></h2><p>{categoriesQuestionnaire[m.categorie]}</p></div><span className={'admin-badge '+(m.valide?'published':'draft')}>{m.valide?'Validé':'Brouillon'}</span></li>)}</ul>}
   {state.data.total>20&&<nav className="admin-pagination" aria-label="Pagination des modèles"><button className="admin-button secondary" disabled={params.page===1} onClick={()=>setParams(p=>({...p,page:p.page-1}))}>Précédent</button><span>Page {params.page}</span><button className="admin-button secondary" disabled={params.page*20>=state.data.total} onClick={()=>setParams(p=>({...p,page:p.page+1}))}>Suivant</button></nav>}</>}
  </div></section>;
 return <section><a href="/admin/questionnaires">← Modèles de questionnaire</a><h1>{creating?'Créer un modèle':'Modifier le modèle'}</h1>
  {state.loading&&<p role="status">Chargement…</p>}{state.error&&<p role="alert">{state.error}</p>}
  {error&&<div className="admin-notice error" role="alert">{error} <a href={window.location.pathname}>Recharger la version enregistrée</a></div>}
  {success&&<p className="admin-notice success" role="status">{success}</p>}
  {confirm&&<Confirmation titre="Valider ce modèle ?" message="Cette version pourra être attribuée. Toute modification ultérieure exigera une nouvelle validation." confirmer="Valider le modèle" busy={busy} onConfirm={validate} onCancel={()=>setConfirm(false)}/>}
  {(creating||item)&&<form onSubmit={save} noValidate className="admin-panel"><p>Modèle {item?.valide?'validé':'en brouillon'}. Les questionnaires déjà attribués restent inchangés.</p>
   <label className="admin-label" htmlFor="modele-titre">Titre</label><input className="admin-input" id="modele-titre" value={values.titre} maxLength={160} onChange={e=>change({...values,titre:e.target.value})} aria-invalid={!!fields.titre}/>{fields.titre&&<p role="alert">{fields.titre}</p>}
   <label className="admin-label" htmlFor="modele-categorie">Catégorie</label><select className="admin-input" id="modele-categorie" value={values.categorie} onChange={e=>change({...values,categorie:e.target.value})}>{Object.entries(categoriesQuestionnaire).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
   {fields.questions&&<p role="alert">{fields.questions}</p>}
   {values.questions.map((q,index)=><fieldset key={q.id} className="admin-seance" disabled={busy}><legend>Question {index+1}</legend>
    <label className="admin-label" htmlFor={q.id+'-libelle'}>Libellé de la question {index+1}</label><input className="admin-input" id={q.id+'-libelle'} value={q.libelle} maxLength={500} onChange={e=>question(index,{...q,libelle:e.target.value})}/>{fields['questions.'+index+'.libelle']&&<p role="alert">{fields['questions.'+index+'.libelle']}</p>}
    <label className="admin-label" htmlFor={q.id+'-type'}>Type de réponse</label><select className="admin-input" id={q.id+'-type'} value={q.type} onChange={e=>question(index,{...q,type:e.target.value,choix:[]})}>{Object.entries(typesQuestion).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
    <label className="questionnaire-choice"><input type="checkbox" checked={q.obligatoire} onChange={e=>question(index,{...q,obligatoire:e.target.checked})}/>Réponse obligatoire</label>
    {(q.type==='CHOIX_UNIQUE'||q.type==='CHOIX_MULTIPLE')&&<><p>Deux à vingt choix distincts pour valider le modèle.</p>{q.choix.map((c,j)=><div className="admin-actions" key={c.id}><label htmlFor={c.id}>Choix {j+1}</label><input className="admin-input" id={c.id} value={c.libelle} maxLength={200} onChange={e=>question(index,{...q,choix:q.choix.map(v=>v.id===c.id?{...v,libelle:e.target.value}:v)})}/><button className="admin-button secondary" type="button" onClick={()=>question(index,{...q,choix:q.choix.filter(v=>v.id!==c.id)})}>Retirer ce choix</button></div>)}<button className="admin-button secondary" type="button" disabled={q.choix.length>=20} onClick={()=>question(index,{...q,choix:[...q.choix,{id:crypto.randomUUID(),libelle:''}]})}>Ajouter un choix</button></>}
    {fields['questions.'+index+'.choix']&&<p role="alert">{fields['questions.'+index+'.choix']}</p>}
    <div className="admin-actions"><button type="button" className="admin-button secondary" disabled={index===0} onClick={()=>move(index,-1)}>Monter</button><button type="button" className="admin-button secondary" disabled={index===values.questions.length-1} onClick={()=>move(index,1)}>Descendre</button><button type="button" className="admin-button secondary" onClick={()=>change({...values,questions:values.questions.filter(v=>v.id!==q.id)})}>Retirer cette question</button></div>
   </fieldset>)}
   <div className="admin-actions"><button className="admin-button secondary" disabled={busy||values.questions.length>=40} type="button" onClick={()=>change({...values,questions:[...values.questions,{id:crypto.randomUUID(),type:'TEXTE_COURT',libelle:'',obligatoire:false,choix:[]}]})}>Ajouter une question</button><button className="admin-button" disabled={busy}>{busy?'Enregistrement…':'Enregistrer le brouillon'}</button>{!creating&&<button type="button" className="admin-button secondary" disabled={busy||dirty||item.valide} onClick={()=>setConfirm(true)}>Valider le modèle</button>}</div>
   <p>Enregistrez vos modifications avant de valider. Quarante questions maximum.</p>
  </form>}
 </section>;
}
