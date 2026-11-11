import {useEffect,useRef,useState} from 'react';
import {adminRequest} from './api';
import {formatParis} from './session-time';
export default function InvitationStagiaire({id}){
 const base='/api/admin/inscriptions/'+encodeURIComponent(id)+'/espace-stagiaire';
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[link,setLink]=useState(''),[message,setMessage]=useState('');
 const lock=useRef(false);
 useEffect(()=>{let live=true;adminRequest(base).then(value=>{if(live)setData(value);}).catch(err=>{if(live)setError(err.message);});return()=>{live=false;};},[base]);
 async function inviter(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setLink('');
  try{const value=await adminRequest(base+'/invitation',{method:'POST',body:'{}'});setLink(window.location.origin+'/stagiaire/activation#'+value.fragment);setData(await adminRequest(base));setMessage('Invitation préparée pour 48 heures. Les invitations précédentes non utilisées sont révoquées.');}
  catch(err){setError(err.message);}finally{setBusy(false);lock.current=false;}
 }
 return <section className="admin-panel"><h2>Espace stagiaire</h2>
  {!data&&!error&&<p role="status">Chargement…</p>}{error&&<p role="alert">{error}</p>}
  {data&&(data.rattachement?<p>Rattachée à {data.rattachement.utilisateur.email} le {formatParis(data.rattachement.createdAt)}.</p>:<><p>Le lien donne accès à cette inscription uniquement. Vérifiez l’identité et l’adresse email du destinataire avant de le transmettre. Aucun email automatique.</p><button className="admin-button secondary" disabled={busy} onClick={inviter}>{busy?'Préparation…':'Préparer une invitation'}</button></>)}
  {message&&<p role="status">{message}</p>}
  {link&&<><label className="admin-label" htmlFor="invitation-link">Lien d’activation à copier maintenant</label><input className="admin-input" id="invitation-link" value={link} readOnly onFocus={event=>event.target.select()}/><p>Ce secret n’est affiché que maintenant. Conservez-le dans un canal privé ; ne le collez pas dans les journaux.</p></>}
  {!!data?.invitations.length&&<details><summary>Historique des invitations</summary><ul>{data.invitations.map(inv=><li key={inv.id}>{formatParis(inv.createdAt)} · {inv.utiliseeAt?'Utilisée le '+formatParis(inv.utiliseeAt):inv.revoqueeAt?'Révoquée le '+formatParis(inv.revoqueeAt):new Date(inv.expireAt)<new Date()?'Expirée':'En attente'} · {inv.auteur.email}</li>)}</ul></details>}
 </section>;
}
