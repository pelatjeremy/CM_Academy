export const fuseauParis='Europe/Paris';
const jour=new Intl.DateTimeFormat('fr-FR',{timeZone:fuseauParis,day:'numeric',month:'long',year:'numeric'});
const horloge=new Intl.DateTimeFormat('fr-FR',{timeZone:fuseauParis,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const decalage=new Intl.DateTimeFormat('fr-FR',{timeZone:fuseauParis,timeZoneName:'shortOffset'});
function instant(value){if(value===null||value===undefined||value==='')return null;const date=new Date(value);return Number.isFinite(date.getTime())?date:null;}
export function dateFr(value){const date=instant(value);return date?jour.format(date):'Date à préciser';}
export function heureFr(value){const date=instant(value);if(!date)return 'Horaire à préciser';const parts=Object.fromEntries(horloge.formatToParts(date).map(p=>[p.type,p.value]));return parts.hour+' h '+parts.minute;}
export function dateHeureFr(value){return instant(value)?dateFr(value)+' à '+heureFr(value):'Date à préciser';}
export function saisonParis(value){return decalage.formatToParts(instant(value)).find(p=>p.type==='timeZoneName')?.value.endsWith('+2')?'heure d’été':'heure d’hiver';}
export function plageFr(debut,fin){
 if(!instant(debut)||!instant(fin))return 'Dates à préciser';
 const changement=saisonParis(debut)!==saisonParis(fin),heure=value=>heureFr(value)+(changement?' ('+saisonParis(value)+')':'');
 return dateFr(debut)===dateFr(fin)?dateFr(debut)+' · '+heure(debut)+' – '+heure(fin):dateFr(debut)+' à '+heure(debut)+' – '+dateFr(fin)+' à '+heure(fin);
}
export function dureeFr(ms,inconnue='Durée à préciser'){
 if(ms===null||ms===undefined||!Number.isFinite(Number(ms))||Number(ms)<0)return inconnue;
 const value=Math.round(Number(ms)),heures=Math.floor(value/3600000),minutes=Math.floor(value%3600000/60000),secondes=value%60000/1000;
 const base=heures?heures+' h'+(minutes?' '+String(minutes).padStart(2,'0'):''):minutes?minutes+' min':secondes?'':'0 min';
 return base+(secondes?(base?' ':'')+secondes.toLocaleString('fr-FR',{maximumFractionDigits:3})+' s':'');
}
export function dureeMinutesFr(minutes,inconnue='Durée à préciser'){return minutes===null||minutes===undefined?inconnue:dureeFr(Number(minutes)*60000,inconnue);}
