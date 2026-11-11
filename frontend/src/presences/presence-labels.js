export const etatsPresence={NON_RENSEIGNE:'Non renseigné',PRESENT:'Présent',PARTIEL:'Partiellement présent',ABSENT:'Absent'};
export function dureePresence(ms){
 if(ms===null||ms===undefined)return 'Durée inconnue';
 const heures=Math.floor(ms/3600000),minutes=Math.floor(ms%3600000/60000),secondes=ms%60000/1000;
 return heures+' h '+String(minutes).padStart(2,'0')+' min'+(secondes?' '+secondes.toLocaleString('fr-FR',{maximumFractionDigits:3})+' s':'');
}
