import {useEffect,useState} from 'react';
import {adminRequest} from '../admin/api';
import {durationLabel,plageFr} from '../admin/session-time';
import {etatsPresence,dureePresence} from './presence-labels';
import PresenceHistorique from './PresenceHistorique';
export default function PresenceSynthese({id,admin=false}){
 const [state,setState]=useState({loading:true}),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();adminRequest('/api/'+(admin?'admin':'stagiaire')+'/inscriptions/'+id+'/presences',{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setState({data});}).catch(err=>{if(!controller.signal.aborted)setState({error:err.message});});return()=>controller.abort();},[id,admin,attempt]);
 return <section className="admin-panel"><h2>Présences</h2><p>Présence renseignée manuellement. Ce relevé ne constitue pas une signature d’émargement et ne valide aucun document.</p>
  {state.loading&&<p role="status">Chargement des présences…</p>}{state.error&&<div role="alert"><p>{state.error}</p><button type="button" className="admin-button secondary" onClick={()=>setAttempt(n=>n+1)}>Réessayer</button></div>}
  {state.data&&<><dl className="admin-dossier-summary"><div><dt>Heures programmées dans les séances</dt><dd>{dureePresence(state.data.dureeProgrammeeMs)}</dd></div><div><dt>Heures de présence renseignées</dt><dd>{state.data.dureeRenseigneeMs===null?'Aucune durée connue':dureePresence(state.data.dureeRenseigneeMs)}</dd></div><div><dt>Séances restant à renseigner</dt><dd>{state.data.seancesARenseigner}</dd></div><div><dt>Durée pédagogique annoncée de la formation</dt><dd>{durationLabel(state.data.dureePedagogiqueMinutes)}</dd></div></dl><p>Le total renseigné est partiel tant que des séances restent à renseigner. « Non renseigné » signifie une durée inconnue, jamais une absence.</p>
   {!state.data.seances.length?<p>Aucune séance programmée.</p>:<ul className="admin-resource-list">{state.data.seances.map(row=><li key={row.id}><div><h3>{plageFr(row.debut,row.fin)}</h3><p>Programmée : {dureePresence(new Date(row.fin)-new Date(row.debut))}</p><p>{etatsPresence[row.presence?.etat||'NON_RENSEIGNE']} · {dureePresence(row.presence?.dureeSuivieMs??null)}</p>{admin&&row.presence&&<PresenceHistorique item={row.presence}/>}</div></li>)}</ul>}
  </>}
 </section>;
}
