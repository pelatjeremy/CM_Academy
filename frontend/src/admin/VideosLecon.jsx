import {useEffect,useRef,useState} from 'react';
import {adminRequest} from './api';
import VideoPlayer from '../pedagogie/VideoPlayer';

function Confirmation({action,onCancel,onConfirm}) {
 const dialog=useRef(null);
 useEffect(()=>{const d=dialog.current;d.showModal();return()=>d.close();},[]);
 return <dialog ref={dialog} className="admin-confirm" aria-labelledby="video-confirm-title" onCancel={e=>{e.preventDefault();onCancel();}}>
  <h2 id="video-confirm-title">{action==='retrait'?'Retirer la vidéo ?':action==='remplacement'?'Remplacer la vidéo ?':'Ajouter la vidéo ?'}</h2>
  <p>{action==='ajout'?'La vidéo sera accessible aux stagiaires autorisés lorsque la leçon et son module sont publiés.':'Les nouvelles requêtes des stagiaires vers l’ancienne version seront refusées. Les données déjà reçues par leur navigateur peuvent rester lisibles. La version reste conservée dans l’historique privé.'}</p>
  <div className="admin-actions"><button type="button" className="admin-button secondary" autoFocus onClick={onCancel}>Annuler</button><button type="button" className="admin-button" onClick={onConfirm}>Confirmer {action==='retrait'?'le retrait':action==='remplacement'?'le remplacement':'l’ajout'}</button></div>
 </dialog>;
}

export default function VideosLecon({base,videos,maxFileBytes,probeStatus,revision,disabled,onDirty,onSaved}) {
 const current=videos.find(v=>!v.retireAt),initial={titre:current?.titre||'',description:current?.description||'',transcription:current?.transcription||''};
 const [values,setValues]=useState(initial),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[confirm,setConfirm]=useState(null),[conflict,setConflict]=useState(false);
 const key=useRef(null),input=useRef(null),controller=useRef(null),lock=useRef(false),originalRevision=useRef(revision);
 const dirty=!!file||JSON.stringify(values)!==JSON.stringify(initial);
 useEffect(()=>{onDirty(dirty||busy);},[dirty,busy,onDirty]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 function change(name,value){setValues(v=>({...v,[name]:value}));setMessage('');key.current=null;}
 async function execute(){
  const action=confirm;setConfirm(null);if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');controller.current=new AbortController();
  try {
   let result;
   if(action==='retrait')result=await adminRequest(base+'/'+current.id+'/retrait',{method:'POST',signal:controller.current.signal,body:JSON.stringify({revision})});
   else {
    const payload=new FormData();payload.append('fichier',file);for(const [name,value]of Object.entries(values))payload.append(name,value);
    key.current ||= crypto.randomUUID();
    result=await adminRequest(base,{method:'POST',body:payload,signal:controller.current.signal,timeoutMs:1800000,headers:{'x-depot-id':key.current,'x-parcours-revision':String(originalRevision.current)}});
   }
   await onSaved(result.revision);originalRevision.current=result.revision;
   setFile(null);if(input.current)input.current.value='';key.current=null;
   setValues(action==='retrait'?{titre:'',description:'',transcription:''}:{titre:result.item.titre,description:result.item.description,transcription:result.item.transcription});
   setMessage(result.message);
  } catch(e){setError(e.message+' Vos informations et le fichier sélectionné sont conservés.');if(e.status===409)setConflict(true);}
  finally{setBusy(false);lock.current=false;}
 }
 function chooseFile(e){const f=e.target.files[0]||null;setError('');setMessage('');key.current=null;if(!dirty)originalRevision.current=revision;
  if(f&&(f.size>maxFileBytes||!f.size||!f.name.toLowerCase().endsWith('.mp4'))){setError('Choisissez un MP4 non vide de '+Math.round(maxFileBytes/1048576)+' Mio maximum.');setFile(null);e.target.value='';return;}setFile(f);
 }
 return <section className="admin-attachments" aria-label="Gestion des vidéos et replays">
  <h3>Vidéo ou replay MP4</h3>
  {probeStatus?.available===false&&<p className="admin-notice error" role="alert">{probeStatus.error}</p>}
  <p id="video-format">Une vidéo active par leçon, {Math.round(maxFileBytes/1048576)} Mio maximum ({maxFileBytes.toLocaleString('fr-FR')} octets). H.264 8 bits (yuv420p), audio AAC facultatif, export avec démarrage rapide (faststart). Aucun transcodage automatique.</p>
  <p>Les remplacements et retraits conservent les versions dans le stockage privé. Pour modifier les informations, déposez une nouvelle version.</p>
  {confirm&&<Confirmation action={confirm} onCancel={()=>setConfirm(null)} onConfirm={execute}/>}
  {error&&<p className="admin-notice error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {conflict&&<p>Le parcours a changé. <a href={window.location.pathname}>Recharger le parcours</a> avant de choisir une nouvelle version.</p>}
  <fieldset className="questionnaire-fields" disabled={disabled||busy||conflict}>
   <label className="admin-label" htmlFor="video-titre">Titre de la vidéo (obligatoire)</label><input className="admin-input" id="video-titre" maxLength={160} value={values.titre} onChange={e=>change('titre',e.target.value)}/>
   <label className="admin-label" htmlFor="video-description">Description (facultative)</label><textarea className="admin-input" id="video-description" maxLength={3000} rows={3} value={values.description} onChange={e=>change('description',e.target.value)}/>
   <label className="admin-label" htmlFor="video-transcription">Transcription textuelle (facultative)</label><textarea className="admin-input" id="video-transcription" maxLength={30000} rows={6} value={values.transcription} onChange={e=>change('transcription',e.target.value)}/>
   <label className="admin-label" htmlFor="video-fichier">Choisir un fichier MP4</label><input ref={input} id="video-fichier" type="file" accept=".mp4,video/mp4" aria-describedby="video-format" onChange={chooseFile}/>
   <div className="admin-actions"><button type="button" className="admin-button" disabled={!file||!values.titre.trim()||probeStatus?.available===false} onClick={()=>setConfirm(current?'remplacement':'ajout')}>{current?'Remplacer la vidéo':'Ajouter la vidéo'}</button>
   {current&&<button type="button" className="admin-button secondary" disabled={dirty} onClick={()=>setConfirm('retrait')}>Retirer la vidéo</button>}</div>
  </fieldset>
  {busy&&<><p role="status">Transfert et validation de la vidéo en cours…</p><button type="button" className="admin-button secondary" onClick={()=>controller.current?.abort()}>Interrompre le transfert</button></>}
  {current?<VideoPlayer key={current.id} video={current} base={base}/>:<p>Aucune vidéo active pour cette leçon.</p>}
  {!!videos.length&&<details><summary>Historique des versions vidéo</summary><ol>{videos.map(v=><li key={v.id}><strong>Version {v.version} · {v.titre}</strong> · {v.nomOriginal}<p>Déposée le {new Date(v.date).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})} par {v.auteur.email}. {v.retireAt?'Retirée le '+new Date(v.retireAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})+' par '+v.retirePar.email:'Version active.'}</p><a href={base+'/'+v.id+'/lecture'} target="_blank" rel="noreferrer">Lire la version {v.version} (nouvel onglet privé)</a></li>)}</ol></details>}
 </section>;
}
