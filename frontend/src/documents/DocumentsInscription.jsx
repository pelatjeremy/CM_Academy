import {useEffect,useRef,useState} from 'react';
import {adminRequest} from '../admin/api';
import {categories} from '../admin/dossier-labels';
import {formatParis} from '../admin/session-time';
import PiecesJointes from '../admin/PiecesJointes';
const etatsSuivi={A_TRANSMETTRE:'À transmettre',A_VERIFIER:'À vérifier',VALIDE:'Validé',A_CORRIGER:'À corriger'};
const ruleOf=e=>Object.fromEntries(['categorie','libelle','consigne','obligatoire','origine','demandee'].map(k=>[k,k==='libelle'?(e[k]||categories[e.categorie]):e[k]]));
function Piece({item,id,stagiaire,limite,modifiable,refresh,setDirty}){
 const [regle,setRegle]=useState(()=>ruleOf(item)),[motif,setMotif]=useState(''),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const lock=useRef(false),depot=useRef(null),decision=useRef(null),input=useRef(null);
 const prefix='/api/'+(stagiaire?'stagiaire':'admin')+'/inscriptions/'+encodeURIComponent(id);
 const base=prefix+'/documents/'+item.categorie;
 async function action(task){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await task();await refresh();}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 function choose(e){setFile(e.target.files[0]||null);depot.current=crypto.randomUUID();setDirty(true);setNotice('');}
 async function upload(){await action(async()=>{
  if(file.size>limite)throw new Error('Le fichier dépasse la taille maximale affichée. Choisissez un fichier plus petit.');
  const form=new FormData();form.append('fichier',file);
  await adminRequest(prefix+'/dossier/elements/'+item.categorie+'/fichiers',{method:'POST',body:form,timeoutMs:120000,headers:{'x-depot-id':depot.current,'x-fichier-revision':String(item.fichierRevision),'x-suivi-revision':String(item.suiviRevision)}});
  setFile(null);input.current.value='';setDirty(false);setNotice('Dépôt confirmé. Votre pièce est à vérifier.');
 });}
 async function decide(etat){await action(async()=>{
  const payload={revision:item.suiviRevision,version:item.fichierRevision,etat,motif,requeteId:decision.current?.etat===etat&&decision.current?.motif===motif?decision.current.requeteId:crypto.randomUUID()};decision.current=payload;
  await adminRequest(base+'/decision',{method:'POST',body:JSON.stringify(payload)});setMotif('');setDirty(false);setNotice('Décision enregistrée.');
 });}
 const history=item.suiviHistorique.filter(h=>h.type==='DECISION'||h.type==='DEPOT');
 const correction=history.filter(h=>h.type==='DECISION'&&h.version===item.fichierRevision&&h.etat==='A_CORRIGER').at(-1);
 return <section className="admin-panel documents-panel" aria-busy={busy}><h3>{item.libelle||categories[item.categorie]}</h3>
 <p><strong>{etatsSuivi[item.suiviEtat]}</strong> · {item.obligatoire?'Obligatoire':'Facultatif'}{!stagiaire&&' · '+(item.origine==='STAGIAIRE'?'Demandé au stagiaire':'Fourni par l’organisme')}{!item.demandee&&' · Non demandé'}</p>
 <p className="document-consigne">{item.consigne}</p>{item.suiviEtat==='A_CORRIGER'&&correction&&<p className="admin-notice"><strong>Correction demandée : </strong><span>{correction.motif}</span></p>}
 {error&&<p role="alert">{error} Le fichier sélectionné et vos saisies restent disponibles. <button type="button" className="admin-button secondary" onClick={()=>action(async()=>{})}>Actualiser l’état</button></p>}
 {notice&&<p role="status">{notice}</p>}
 {!stagiaire&&<details><summary>Configurer cette pièce pour l’inscription</summary><form onSubmit={e=>{e.preventDefault();action(async()=>{await adminRequest(base+'/configuration',{method:'PUT',body:JSON.stringify({revision:item.suiviRevision,regle})});setDirty(false);setNotice('Configuration enregistrée.');});}}>
 <label>Libellé<input className="admin-input" value={regle.libelle} maxLength={160} required onChange={e=>{setRegle({...regle,libelle:e.target.value});setDirty(true);}}/></label>
 <label>Consigne visible par le stagiaire<textarea className="admin-input" value={regle.consigne} maxLength={3000} onChange={e=>{setRegle({...regle,consigne:e.target.value});setDirty(true);}}/></label>
 <label>Origine attendue<select className="admin-input" value={regle.origine} onChange={e=>{setRegle({...regle,origine:e.target.value});setDirty(true);}}><option value="STAGIAIRE">Stagiaire</option><option value="ORGANISME">Organisme</option></select></label>
 <label><input type="checkbox" checked={regle.demandee} onChange={e=>{setRegle({...regle,demandee:e.target.checked});setDirty(true);}}/> Pièce demandée</label>
 <label><input type="checkbox" checked={regle.obligatoire} onChange={e=>{setRegle({...regle,obligatoire:e.target.checked});setDirty(true);}}/> Obligatoire pour la complétude</label>
 <button className="admin-button" disabled={busy}>Enregistrer la configuration</button></form></details>}
 {stagiaire?<>
 {!item.fichiers.length?<p>Aucun dépôt.</p>:<ol className="admin-file-versions">{item.fichiers.map(f=><li key={f.id}><a download href={prefix+'/dossier/elements/'+item.categorie+'/fichiers/'+f.id+'/telecharger'}>{f.nomOriginal} · version {f.version}</a><p>Déposé le {formatParis(f.date)}{history.find(h=>h.version===f.version&&h.type==='DECISION')?' · '+etatsSuivi[history.filter(h=>h.version===f.version&&h.type==='DECISION').at(-1).etat]:''}</p></li>)}</ol>}
 {modifiable?<><p>PDF, JPEG ou PNG · {(limite/1048576).toLocaleString('fr-FR')} Mo maximum. Une nouvelle version conserve les précédentes et repasse à « À vérifier ».</p><label>Fichier à transmettre<input className="admin-file-input" ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} onChange={choose}/></label><button className="admin-button" disabled={busy||!file} onClick={upload}>{busy?'Transfert en cours…':item.fichierRevision?'Transmettre une nouvelle version':'Transmettre la pièce'}</button></>:<p>Cette inscription ne permet plus de dépôt.</p>}
 </>:<><PiecesJointes inscriptionId={id} categorie={item.categorie} fichiers={item.fichiers} onVersions={()=>{}} onPending={(_,pending)=>setDirty(pending)}/><button className="admin-button secondary" disabled={busy} onClick={()=>action(async()=>{})}>Actualiser après dépôt</button>
 {item.demandee&&item.suiviEtat==='A_VERIFIER'&&<div><label>Motif visible par le stagiaire (obligatoire pour une correction)<textarea className="admin-input" maxLength={1000} value={motif} onChange={e=>{setMotif(e.target.value);setDirty(true);}}/></label><button className="admin-button" disabled={busy} onClick={()=>decide('VALIDE')}>Valider la version {item.fichierRevision}</button> <button className="admin-button secondary" disabled={busy||!motif.trim()} onClick={()=>decide('A_CORRIGER')}>Demander une correction</button></div>}</>}
 <details><summary>Historique des dépôts et décisions</summary>{history.length?<ol>{history.map((h,n)=><li key={n}>{formatParis(h.date)} · {!stagiaire&&h.auteur?h.auteur:h.role} · version {h.version} · {etatsSuivi[h.etat]}{h.motif&&<p>{h.motif}</p>}</li>)}</ol>:<p>Aucun événement.</p>}</details>
 </section>;
}
export default function DocumentsInscription({id,stagiaire=false,setDirty}){
 const [state,setState]=useState({loading:true}),[message,setMessage]=useState('');
 const base='/api/'+(stagiaire?'stagiaire':'admin')+'/inscriptions/'+encodeURIComponent(id)+'/documents';
 async function refresh(){const data=await adminRequest(base);setState({data});}
 useEffect(()=>{const c=new AbortController();adminRequest(base,{signal:c.signal}).then(data=>{if(!c.signal.aborted)setState({data});}).catch(e=>{if(!c.signal.aborted)setState({error:e.message});});return()=>c.abort();},[base]);
 const pending=useRef(new Set());
 function dirty(key,value){if(value)pending.current.add(key);else pending.current.delete(key);setDirty(pending.current.size>0);}
 return <><h2>{stagiaire?'Mes documents':'Documents de l’inscription'}</h2>
 {state.loading&&<p role="status">Chargement des documents…</p>}{state.error&&<p role="alert">{state.error}</p>}
 <button className="admin-button secondary" onClick={()=>refresh().catch(e=>setMessage(e.message))}>Actualiser les documents</button>
 {!stagiaire&&<><p><a href={'/admin/inscriptions/'+id+'/dossier'}>Ouvrir le dossier administratif et les documents partagés</a></p><button className="admin-button secondary" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin+'/stagiaire/inscriptions/'+id+'/documents');setMessage('Lien copié. Transmettez-le manuellement au stagiaire.');}catch{setMessage('Copie impossible. Lien : '+window.location.origin+'/stagiaire/inscriptions/'+id+'/documents');}}}>Copier le lien stagiaire</button></>}
 {message&&<p role="status">{message}</p>}
 {state.data?.completude&&<p>Pièces obligatoires validées : {state.data.completude.valides} / {state.data.completude.total}. {state.data.completude.complet?'Dossier documentaire complet.':'Dossier documentaire incomplet.'} Ce suivi ne valide ni présence, ni acquis, ni attestation.</p>}
 {state.data&&!state.data.items.length&&<><p>Aucune pièce ne vous est demandée pour cette inscription.</p>{!stagiaire&&<button className="admin-button" onClick={async()=>{try{await adminRequest(base+'/initialiser',{method:'POST',body:'{}'});await refresh();}catch(e){setMessage(e.message);}}}>Initialiser les pièces du dossier</button>}</>}
 {state.data?.items.map(item=><Piece key={item.categorie} item={item} id={id} stagiaire={stagiaire} limite={state.data.limiteOctets} modifiable={state.data.modifiable} refresh={refresh} setDirty={v=>dirty(item.categorie,v)}/>)}
 </>;
}
