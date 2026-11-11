import {formatParis} from './session-time';
import {useRef,useState} from 'react';
import {adminRequest} from './api';
export default function PartageDocument({base,version,onRefresh}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');const lock=useRef(false);
 async function partager(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
  try{await adminRequest(base+'/'+version.id+'/partage',{method:'PUT',body:JSON.stringify({partage:!version.partageStagiaire,revision:version.partageRevision})});await onRefresh();setMessage('Décision de partage enregistrée.');}
  catch(err){setError(err.message);}finally{setBusy(false);lock.current=false;}
 }
 return <div><p>{version.partageStagiaire?'Accessible au stagiaire rattaché':'Privée — administration uniquement'}</p><button type="button" className="admin-button secondary" disabled={busy} onClick={partager}>{busy?'Enregistrement…':version.partageStagiaire?'Retirer le partage':'Partager cette version'}</button>{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{!!version.historiquePartages?.length&&<details><summary>Historique du partage</summary><ul>{version.historiquePartages.map(event=><li key={event.id}>{event.partage?'Partagée':'Accès retiré'} · {formatParis(event.date)} · {event.auteur.email}</li>)}</ul></details>}</div>;
}
