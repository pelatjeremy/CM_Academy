export const formatLabels={WEBINAIRE:'Webinaire',PRESENTIEL:'Présentiel',HYBRIDE:'Hybride'};
export function duration(minutes){
  if(minutes===null)return 'Durée à préciser';
  const hours=Math.floor(minutes/60),rest=minutes%60;
  return `${hours?`${hours} h`:''}${hours&&rest?' ':''}${rest?`${rest} min`:''}`;
}
// Le montant reste une chaîne décimale exacte jusqu’à l’affichage.
export function price(amount,currency){
  if(amount===null)return 'Tarif non renseigné';
  if(/^0(?:\.0+)?$/.test(amount))return 'Gratuit';
  const [integer,fraction='00']=amount.split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g,'\u202f')},${fraction} ${currency}`;
}
const date=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',weekday:'long',year:'numeric',month:'long',day:'numeric'});
const time=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'});
export function parisDate(instant){return date.format(new Date(instant));}
export function parisTime(instant){return time.format(new Date(instant));}
