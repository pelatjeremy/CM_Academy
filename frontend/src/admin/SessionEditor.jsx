import {useEffect,useRef,useState} from 'react';
import {adminRequest} from './api';
import {FormField} from './CatalogueResource';
import {durationLabel,rowOrder} from './session-time';

const offsetOptions=[{value:'+02:00',label:'Heure d’été — première occurrence'},{value:'+01:00',label:'Heure d’hiver — seconde occurrence'}];
const privateBlank={lienVisioconference:'',consignes:''};
const valuesOf=item=>({formationId:item.formationId,capacite:String(item.capacite??''),lieu:item.lieu||'',modalitesPratiques:item.modalitesPratiques,visiblePubliquement:item.visiblePubliquement,preinscriptionsOuvertes:item.preinscriptionsOuvertes,
  seances:item.seances.map(row=>({id:row.id,key:row.id,debutLocal:row.debutLocal,finLocal:row.finLocal,debutOffset:row.debutOffset,finOffset:row.finOffset}))});
const payloadOf=values=>({...values,fuseauHoraire:'Europe/Paris',seances:values.seances.map(({id,debutLocal,finLocal,debutOffset,finOffset})=>({...(id?{id}:{}),debutLocal,finLocal,debutOffset,finOffset}))});
export default function SessionEditor({id,setDirty}){
  const [values,setValues]=useState(()=>({formationId:new URLSearchParams(window.location.search).get('formationId')||'',capacite:'',lieu:'',modalitesPratiques:'',visiblePubliquement:false,preinscriptionsOuvertes:false,seances:[]}));
  const [baseline,setBaseline]=useState(values),[record,setRecord]=useState(null),[options,setOptions]=useState([]);
  const [state,setState]=useState('chargement'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[errors,setErrors]=useState({}),[success,setSuccess]=useState(''),[conflict,setConflict]=useState(false);
  const [preview,setPreview]=useState(null);
  const [privateState,setPrivateState]=useState('ferme'),[privateValues,setPrivateValues]=useState(privateBlank),[privateBase,setPrivateBase]=useState(privateBlank);
  const loadedId=useRef(null);
  const primaryDirty=JSON.stringify(values)!==JSON.stringify(baseline),privateDirty=JSON.stringify(privateValues)!==JSON.stringify(privateBase);
  const disabled=busy||privateState==='chargement';
  useEffect(()=>{
    if(id&&loadedId.current===id)return;
    const controller=new AbortController();
    Promise.all([adminRequest('/api/admin/sessions/options',{signal:controller.signal}),id?adminRequest(`/api/admin/sessions/${encodeURIComponent(id)}`,{signal:controller.signal}):Promise.resolve(null)]).then(([choices,data])=>{
      if(controller.signal.aborted)return;setOptions(choices.formations);
      if(data){const next=valuesOf(data.item);loadedId.current=data.item.id;setValues(next);setBaseline(next);setRecord(data.item);setPreview(data.item);}
      setState('pret');
    }).catch(err=>{if(!controller.signal.aborted){setState('erreur');setError(err.message);}});
    return()=>controller.abort();
  },[id]);
  function change(next){setValues(next);setPreview(null);setSuccess('');setDirty(JSON.stringify(next)!==JSON.stringify(baseline)||privateDirty);}
  function field(name,value){change({...values,[name]:value});setErrors(previous=>({...previous,[name]:undefined}));}
  function rowField(index,name,value){const rows=values.seances.map((row,i)=>i===index?{...row,[name]:value,...(name.endsWith('Local')?{[name.replace('Local','Offset')]:''}:{})}:row);change({...values,seances:rows});setErrors(previous=>({...previous,[`seances.${index}.${name}`]:undefined}));}
  function failure(err){setError(err.message);setErrors(err.fields||{});setConflict(err.code==='CONFLICT');}
  function begin(){setBusy(true);setError('');setErrors({});setSuccess('');}
  async function save(event){event.preventDefault();begin();try{
    const data=await adminRequest(`/api/admin/sessions${record?`/${record.id}`:''}`,{method:record?'PUT':'POST',body:JSON.stringify({...payloadOf(values),...(record?{updatedAt:record.updatedAt}:{})})});
    const next=valuesOf(data.item);loadedId.current=data.item.id;setRecord(data.item);setValues(next);setBaseline(next);setPreview(data.item);setDirty(privateDirty);setSuccess('La session et ses séances ont été enregistrées.');
    if(!record)window.history.replaceState(null,'',`/admin/catalogue/sessions/${data.item.id}/modifier`);
  }catch(err){failure(err);}finally{setBusy(false);}}
  async function verify(){begin();try{setPreview(await adminRequest('/api/admin/sessions/verifier-horaires',{method:'POST',body:JSON.stringify({formationId:values.formationId,seances:payloadOf(values).seances})}));setSuccess('Les horaires ont été vérifiés. Les modifications ne sont pas encore enregistrées.');}catch(err){failure(err);}finally{setBusy(false);}}
  async function openPrivate(){setPrivateState('chargement');setError('');try{
    const data=await adminRequest(`/api/admin/sessions/${record.id}/acces-prive`);
    if(data.updatedAt!==record.updatedAt){const err=new Error('Cette session a changé. Rechargez la fiche avant de modifier les accès privés.');err.code='CONFLICT';throw err;}
    const next={lienVisioconference:data.accesPrive?.lienVisioconference||'',consignes:data.accesPrive?.consignes||''};setPrivateValues(next);setPrivateBase(next);setPrivateState('pret');
  }catch(err){failure(err);setPrivateState('erreur');}}
  function changePrivate(name,value){const next={...privateValues,[name]:value};setPrivateValues(next);setSuccess('');setDirty(primaryDirty||JSON.stringify(next)!==JSON.stringify(privateBase));setErrors(previous=>({...previous,[name]:undefined}));}
  async function savePrivate(event){event.preventDefault();begin();try{
    const data=await adminRequest(`/api/admin/sessions/${record.id}/acces-prive`,{method:'PUT',body:JSON.stringify({...privateValues,updatedAt:record.updatedAt})});
    setRecord(previous=>({...previous,updatedAt:data.updatedAt}));const next={lienVisioconference:data.accesPrive.lienVisioconference||'',consignes:data.accesPrive.consignes};setPrivateValues(next);setPrivateBase(next);setDirty(primaryDirty);setSuccess('Les accès privés ont été enregistrés séparément.');
  }catch(err){failure(err);}finally{setBusy(false);}}
  const ordered=values.seances.map((row,index)=>({row,index})).sort((a,b)=>rowOrder(a.row)-rowOrder(b.row)||a.index-b.index);
  return <>
    <div className="admin-page-heading"><div><a className="admin-back" href="/admin/catalogue/sessions">← Sessions</a><h1>{id||record?'Modifier la session':'Créer une session'}</h1><p>Une session organise plusieurs séances datées d’une formation.</p></div></div>
    {error&&<div className="admin-notice error" role="alert"><p>{error}</p>{conflict&&<a href={window.location.pathname}>Recharger la fiche</a>}</div>}{success&&<p className="admin-notice success" role="status">{success}</p>}
    {state==='chargement'&&<p role="status">Chargement de la session…</p>}{state==='erreur'&&<a href={window.location.href} className="admin-button secondary">Réessayer</a>}
    {state==='pret'&&<>
      {record&&<p><a className="admin-button secondary" href={'/admin/catalogue/sessions/'+record.id+'/presences'}>Gérer les présences</a></p>}
      <form noValidate onSubmit={save} aria-busy={disabled}>
        <fieldset className="admin-panel admin-form-section"><legend>1. Informations pratiques</legend>
          <FormField field={{name:'formationId',label:'Formation',required:true,type:'select',options:options.map(item=>({value:item.id,label:`${item.titre}${item.publiee?'':' — Brouillon'}`}))}} value={values.formationId} error={errors.formationId} disabled={disabled} onChange={value=>field('formationId',value)} />
          <FormField field={{name:'capacite',label:'Capacité',inputMode:'numeric',hint:'Nombre maximal de places. Vide = non renseigné ; entier strictement positif.'}} value={values.capacite} error={errors.capacite} disabled={disabled} onChange={value=>field('capacite',value)} />
          <FormField field={{name:'lieu',label:'Lieu',max:1000,hint:'Ce lieu est affiché sur la fiche publique si la session est visible. N’y saisissez pas de code ou de lien privé.'}} value={values.lieu} error={errors.lieu} disabled={disabled} onChange={value=>field('lieu',value)} />
          <FormField field={{name:'visiblePubliquement',label:'Afficher cette session sur la fiche publique',type:'checkbox',hint:'Désactivé par défaut. Au moins une séance est nécessaire. La formation doit aussi être publiée ; les accès privés restent confidentiels.'}} value={values.visiblePubliquement} error={errors.visiblePubliquement} disabled={disabled} onChange={value=>field('visiblePubliquement',value)} />
          <FormField field={{name:'preinscriptionsOuvertes',label:'Ouvrir les préinscriptions',type:'checkbox',hint:'Le formulaire apparaît sur la fiche publiée si la session est visible et si sa première séance est à venir.'}} value={values.preinscriptionsOuvertes} error={errors.preinscriptionsOuvertes} disabled={disabled} onChange={value=>field('preinscriptionsOuvertes',value)} />
          <FormField field={{name:'modalitesPratiques',label:'Modalités pratiques',multiline:true,max:5000,hint:'Informations générales uniquement. Utilisez la section Accès privés pour les liens, codes et consignes confidentiels.'}} value={values.modalitesPratiques} error={errors.modalitesPratiques} disabled={disabled} onChange={value=>field('modalitesPratiques',value)} />
        </fieldset>
        <section className="admin-panel admin-form-section" aria-labelledby="seances-title"><h2 id="seances-title">2. Séances et horaires</h2><p>Fuseau de saisie et d’affichage : <strong>Europe/Paris</strong>.</p><p>Une séance est un rendez-vous daté, pas un module pédagogique. Précisez le décalage lorsqu’une heure se produit deux fois au changement d’heure.</p>
          {errors.seances&&<p role="alert" className="admin-field-error">{errors.seances}</p>}
          {!ordered.length&&<p className="admin-notice" role="status">Aucune séance. Vous pouvez enregistrer la session et préparer ses dates plus tard.</p>}
          {ordered.map(({row,index},order)=><fieldset className="admin-seance" key={row.key}><legend>Séance {order+1}</legend>
            {errors[`seances.${index}.id`]&&<p className="admin-field-error">{errors[`seances.${index}.id`]}</p>}
            <div className="admin-filter-grid">{['debut','fin'].map(part=><div key={part}>
              <FormField field={{name:`seance-${row.key}-${part}`,label:part==='debut'?'Début (Europe/Paris)':'Fin (Europe/Paris)',type:'datetime-local',step:'0.001',required:true}} value={row[`${part}Local`]} error={errors[`seances.${index}.${part}Local`]} disabled={disabled} onChange={value=>rowField(index,`${part}Local`,value)} />
              <FormField field={{name:`seance-${row.key}-${part}-offset`,label:`Décalage ${part==='debut'?'du début':'de la fin'}`,type:'select',placeholder:'Automatique (hors heure ambiguë)',options:offsetOptions,hint:'À préciser seulement en cas d’heure ambiguë. La première occurrence précède la seconde lors du passage à l’heure d’hiver.'}} value={row[`${part}Offset`]} error={errors[`seances.${index}.${part}Offset`]} disabled={disabled} onChange={value=>rowField(index,`${part}Offset`,value)} />
            </div>)}</div>
            <button className="admin-button secondary" type="button" disabled={disabled} onClick={()=>change({...values,seances:values.seances.filter((_,i)=>i!==index)})}>Retirer la séance {order+1}</button><p className="admin-hint">Le retrait ne sera appliqué qu’à l’enregistrement.</p>
          </fieldset>)}
          <div className="admin-actions"><button className="admin-button secondary" type="button" disabled={disabled||values.seances.length>=100} onClick={()=>change({...values,seances:[...values.seances,{key:crypto.randomUUID(),debutLocal:'',finLocal:'',debutOffset:'',finOffset:''}]})}>Ajouter une séance</button><button className="admin-button secondary" type="button" disabled={disabled} onClick={verify}>Vérifier les horaires</button></div>
          {preview?<div className={`admin-notice ${preview.durationMismatch?'warning':''}`} role="status"><p>Heures programmées : <strong>{durationLabel(preview.totalMinutes)}</strong>. Durée pédagogique annoncée : {durationLabel(preview.announcedMinutes)}.</p>{preview.durationMismatch&&<p>Les durées diffèrent. Vérifiez le calendrier ; cet avertissement ne bloque pas l’enregistrement.</p>}</div>:<p className="admin-hint">Vérifiez les horaires ou enregistrez pour calculer la durée totale.</p>}
        </section>
        <div className="admin-actions admin-save-actions"><button className="admin-button" type="submit" disabled={disabled||conflict}>{busy?'Traitement…':'Enregistrer la session'}</button><a className="admin-button secondary" href="/admin/catalogue/sessions">Retour à la liste</a></div>
      </form>
      <section className="admin-panel" aria-labelledby="private-title"><h2 id="private-title">3. Accès privés de visioconférence</h2><p>Ces informations confidentielles sont chargées et enregistrées séparément. Elles ne figurent pas dans les listes ou le catalogue public.</p>
        {!record?<p>Enregistrez d’abord la session pour préparer ses accès privés.</p>:privateState==='chargement'?<p role="status">Chargement des accès privés…</p>:privateState!=='pret'?<button className="admin-button secondary" disabled={disabled||conflict} onClick={openPrivate}>{privateState==='erreur'?'Réessayer le chargement privé':'Ouvrir les accès privés'}</button>:<form noValidate onSubmit={savePrivate}>
          <FormField field={{name:'lienVisioconference',label:'Lien privé de visioconférence',type:'url',max:2048,hint:'Facultatif : les consignes peuvent être préparées avant le lien.'}} value={privateValues.lienVisioconference} error={errors.lienVisioconference} disabled={disabled} onChange={value=>changePrivate('lienVisioconference',value)} />
          <FormField field={{name:'consignes',label:'Consignes privées',multiline:true,max:5000,hint:'Instructions confidentielles de connexion, codes ou précisions destinées aux personnes autorisées.'}} value={privateValues.consignes} error={errors.consignes} disabled={disabled} onChange={value=>changePrivate('consignes',value)} />
          <button className="admin-button secondary" type="submit" disabled={disabled||conflict}>Enregistrer les accès privés</button>
        </form>}
      </section>
    </>}
  </>;
}
