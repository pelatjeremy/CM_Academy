import {formatParis} from '../admin/session-time';
import {etatsPresence,dureePresence} from './presence-labels';
export default function PresenceHistorique({item}){
 if(!item)return <p>Aucun relevé enregistré.</p>;
 return <details><summary>Historique des présences</summary><ol className="admin-dossier-history">{item.historique.map(event=><li key={event.id}>
  <p>{formatParis(event.date)} · {event.auteur.email}</p><p>{event.ancienEtat?etatsPresence[event.ancienEtat]+' ('+dureePresence(event.ancienneDureeMs)+') → ':'Saisie initiale → '}{etatsPresence[event.nouvelEtat]} ({dureePresence(event.nouvelleDureeMs)})</p>{event.motif&&<p className="admin-dossier-note">Motif interne : {event.motif}</p>}
 </li>)}</ol></details>;
}
