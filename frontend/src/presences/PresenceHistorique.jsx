import {formatParis} from '../admin/session-time';
import {etatsPresence,dureePresence} from './presence-labels';
export default function PresenceHistorique({item,table=false}){
 if(!item)return <p>Aucun relevé enregistré.</p>;
 if(table)return item.historique.length?<div className="presence-history-scroll" role="region" aria-label="Historique de la séance, défilement horizontal" tabIndex={0}><table className="presence-history-table"><caption>Historique des présences · {item.historique.length} événement{item.historique.length>1?'s':''}</caption><thead><tr><th scope="col">Date et auteur</th><th scope="col">Avant</th><th scope="col">Après</th><th scope="col">Motif interne</th></tr></thead><tbody>{item.historique.map(event=><tr key={event.id}><td><time dateTime={event.date}>{formatParis(event.date)}</time><span>{event.auteur.email}</span></td><td>{event.ancienEtat?<>{etatsPresence[event.ancienEtat]}<span>{dureePresence(event.ancienneDureeMs)}</span></>:'Saisie initiale'}</td><td>{etatsPresence[event.nouvelEtat]}<span>{dureePresence(event.nouvelleDureeMs)}</span></td><td>{event.motif||'—'}</td></tr>)}</tbody></table></div>:<p>Aucun événement de présence.</p>;
 return <details><summary>Historique des présences</summary><ol className="admin-dossier-history">{item.historique.map(event=><li key={event.id}>
  <p>{formatParis(event.date)} · {event.auteur.email}</p><p>{event.ancienEtat?etatsPresence[event.ancienEtat]+' ('+dureePresence(event.ancienneDureeMs)+') → ':'Saisie initiale → '}{etatsPresence[event.nouvelEtat]} ({dureePresence(event.nouvelleDureeMs)})</p>{event.motif&&<p className="admin-dossier-note">Motif interne : {event.motif}</p>}
 </li>)}</ol></details>;
}
