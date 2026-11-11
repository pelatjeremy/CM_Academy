export const formatLabels={WEBINAIRE:'Webinaire',PRESENTIEL:'Présentiel',HYBRIDE:'Hybride'};
export {dureeMinutesFr as duration,dateFr as parisDate,heureFr as parisTime,plageFr} from '../../../shared/format-fr.mjs';
// Le montant reste une chaîne décimale exacte jusqu’à l’affichage.
export function price(amount,currency){
  if(amount===null)return 'Tarif non renseigné';
  if(/^0(?:\.0+)?$/.test(amount))return 'Gratuit';
  const [integer,fraction='00']=amount.split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g,'\u202f')},${fraction} ${currency}`;
}
