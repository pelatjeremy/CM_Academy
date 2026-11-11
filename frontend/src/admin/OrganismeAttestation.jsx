import {useEffect,useState} from 'react';
import {adminRequest} from './api';
import {FormField} from './CatalogueResource';
const vide={denomination:'',adresse:'',identifiant:'',representant:'',revision:0};
export default function OrganismeAttestation({setDirty}){
 const [values,setValues]=useState(vide),[baseline,setBaseline]=useState(vide),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[fields,setFields]=useState({}),[message,setMessage]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const c=new AbortController();adminRequest('/api/admin/organisme-attestation',{signal:c.signal}).then(data=>{if(!c.signal.aborted){setValues(data.item||vide);setBaseline(data.item||vide);}}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[attempt]);
 function change(name,value){const next={...values,[name]:value};setValues(next);setDirty(JSON.stringify(next)!==JSON.stringify(baseline));setMessage('');}
 async function save(e){e.preventDefault();setBusy(true);setError('');setFields({});try{const data=await adminRequest('/api/admin/organisme-attestation',{method:'PUT',body:JSON.stringify(values)});setValues(data.item);setBaseline(data.item);setDirty(false);setMessage(data.message);}catch(err){setError(err.message);setFields(err.fields||{});}finally{setBusy(false);}}
 return <><div className="admin-page-heading"><div><h1>Organisme de formation</h1><p>Informations utilisées pour les prochaines attestations. Les documents déjà émis restent inchangés.</p></div></div><section className="admin-panel">
 {loading?<p role="status">Chargement…</p>:<form onSubmit={save} aria-busy={busy}><p className="admin-notice">La dénomination et l’adresse sont indispensables à l’émission. Aucun logo ni signature n’est ajouté. L’identifiant et le représentant sont facultatifs : renseignez uniquement des informations vérifiées.</p>
 {error&&<p role="alert" className="admin-notice error">{error}</p>}{message&&<p role="status" className="admin-notice success">{message}</p>}
 {Object.entries({denomination:['Dénomination de l’organisme',200],adresse:['Adresse de l’organisme',1000],identifiant:['Identifiant de l’organisme',100],representant:['Représentant déclaré, sans signature',200]}).map(([name,[label,max]])=><FormField key={name} field={{name,label,max,required:['denomination','adresse'].includes(name),multiline:name==='adresse',hint:['denomination','adresse'].includes(name)?'Nécessaire pour émettre une attestation.':undefined}} value={values[name]} error={fields[name]} disabled={busy} onChange={v=>change(name,v)}/>)}
 <div className="admin-actions"><button className="admin-button" disabled={busy}>{busy?'Enregistrement…':'Enregistrer les informations'}</button><button type="button" className="admin-button secondary" disabled={busy} onClick={()=>{if(JSON.stringify(values)!==JSON.stringify(baseline))return setError('Enregistrez votre saisie ou quittez cette page avant de recharger.');setLoading(true);setError('');setAttempt(n=>n+1);}}>Recharger</button></div></form>}
 </section></>;
}
