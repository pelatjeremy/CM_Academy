import {useEffect,useRef,useState} from 'react';
import {adminRequest} from './api';
import {FormField} from './CatalogueResource';
import {formatParis} from './session-time';
import PartageDocument from './PartageDocument';

function Confirmation({onCancel,onConfirm,busy}){
 const ref=useRef(null);
 useEffect(()=>{ref.current.showModal();},[]);
 return <dialog ref={ref} className="admin-confirm" aria-labelledby="attestation-confirm" onCancel={e=>{e.preventDefault();if(!busy)onCancel();}}><h2 id="attestation-confirm">Émettre cette attestation ?</h2><p>Les données seront figées et un PDF privé sera conservé. Cette action ne valide aucun état documentaire et ne signe pas le document.</p><div className="admin-actions"><button type="button" className="admin-button secondary" disabled={busy} onClick={onCancel}>Annuler</button><button type="button" className="admin-button" disabled={busy} onClick={onConfirm}>{busy?'Émission…':'Confirmer l’émission'}</button></div></dialog>;
}
export default function AttestationsDossier({id,onPending,onEmission}){
 const base='/api/admin/inscriptions/'+encodeURIComponent(id)+'/dossier/attestations';
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[preview,setPreview]=useState(null),[motif,setMotif]=useState(''),[message,setMessage]=useState(''),[confirm,setConfirm]=useState(false),[fields,setFields]=useState({});
 const lock=useRef(false),requete=useRef(null),pdfUrl=useRef(null);
 async function refresh(){setData(await adminRequest(base));}
 async function actualiser(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await refresh();}catch(e){setError(e.message);}finally{setBusy(false);lock.current=false;}}
 useEffect(()=>{const c=new AbortController();adminRequest(base,{signal:c.signal}).then(d=>{if(!c.signal.aborted)setData(d);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[base]);
 useEffect(()=>()=>{if(pdfUrl.current)URL.revokeObjectURL(pdfUrl.current);},[]);
 async function apercu(){if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');try{const p=await adminRequest(base+'/apercu',{method:'POST',body:'{}',timeoutMs:35000});const bytes=Uint8Array.from(atob(p.pdf),c=>c.charCodeAt(0));if(pdfUrl.current)URL.revokeObjectURL(pdfUrl.current);pdfUrl.current=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));setPreview({...p,url:pdfUrl.current});setFields(p.fields);requete.current=crypto.randomUUID();}catch(e){setError(e.message);}finally{setBusy(false);lock.current=false;}}
 async function emettre(){if(lock.current||!preview)return;lock.current=true;setBusy(true);setError('');setMessage('');try{await adminRequest(base+'/emettre',{method:'POST',timeoutMs:45000,body:JSON.stringify({requeteId:requete.current,empreinte:preview.empreinte,couranteId:preview.couranteId,motif,confirmation:true})});await refresh();setPreview(null);setMotif('');onPending('attestation',false);onEmission();setMessage('Attestation émise et conservée. Elle reste privée tant que vous ne la partagez pas.');}catch(e){setError(e.message);setFields(e.fields||{});/* Même identifiant conservé si la réponse du commit est perdue. */}finally{setConfirm(false);setBusy(false);lock.current=false;}}
 return <section className="admin-panel" aria-labelledby="attestation-heading"><h2 id="attestation-heading">Attestation de fin de formation</h2><p>Document établi à partir des informations enregistrées et des présences renseignées manuellement. Les états documentaires restent indépendants.</p>
 {loading&&<p role="status">Chargement des attestations…</p>}{error&&<p role="alert" className="admin-notice error">{error}</p>}{message&&<p role="status" className="admin-notice success">{message}</p>}
 <a href="/admin/organisme">Configurer les informations de l’organisme</a>
 {!!Object.keys(data?.fields||{}).length&&<div className="admin-notice warning"><p>Éléments à compléter avant émission :</p><ul>{Object.entries(data.fields).map(([k,v])=><li key={k}>{v}</li>)}</ul></div>}
 <div className="admin-actions"><button type="button" className="admin-button secondary" disabled={busy} onClick={apercu}>{busy?'Traitement…':'Préparer l’aperçu PDF'}</button><button type="button" className="admin-button secondary" disabled={busy} onClick={actualiser}>Actualiser les attestations</button></div>
 {preview&&<><p><a className="admin-button secondary" href={preview.url} target="_blank" rel="noreferrer">Ouvrir le PDF brouillon</a></p><iframe className="admin-pdf-preview" title="Aperçu PDF brouillon de l’attestation" src={preview.url}/>
 <fieldset className="questionnaire-fields" disabled={busy}><FormField field={{name:'attestation-motif',label:preview.couranteId?'Motif de correction':'Note d’émission',required:!!preview.couranteId,multiline:true,max:500}} value={motif} error={fields.motif} onChange={v=>{setMotif(v);onPending('attestation',!!v);requete.current=crypto.randomUUID();}}/></fieldset>
 {!!Object.keys(fields).length&&<ul className="admin-field-error">{Object.entries(fields).map(([k,v])=><li key={k}>{v}</li>)}</ul>}
 <button type="button" className="admin-button" disabled={busy||Object.keys(preview.fields).length>0||(!!preview.couranteId&&!motif.trim())} onClick={()=>setConfirm(true)}>{preview.couranteId?'Émettre une correction':'Émettre l’attestation'}</button></>}
 {confirm&&<Confirmation busy={busy} onCancel={()=>setConfirm(false)} onConfirm={emettre}/>}
 {data?.versions.length===0&&<p>Aucune attestation émise.</p>}
 {!!data?.versions.length&&<ol className="admin-file-versions">{data.versions.map(v=><li key={v.id}><h3>Version {v.numero} · {v.courante?'Version de référence':'Version antérieure'}</h3><p>{v.reference} · {formatParis(v.date)} · {v.auteur.email}</p>{v.motif&&<p className="admin-dossier-note">Motif : {v.motif}</p>}<p>PDF · {v.pieceJointe.taille.toLocaleString('fr-FR')} octets</p><a href={base+'/'+v.id+'/telecharger'} download>Télécharger cette attestation</a><PartageDocument base={'/api/admin/inscriptions/'+encodeURIComponent(id)+'/dossier/elements/ATTESTATION/fichiers'} version={v.pieceJointe} onRefresh={refresh}/></li>)}</ol>}
 </section>;
}
