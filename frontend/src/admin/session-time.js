const parisDate = new Intl.DateTimeFormat('fr-FR', { timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset' });
export function formatParis(instant) { return instant ? parisDate.format(new Date(instant)) : 'Dates à définir'; }
export function durationLabel(minutes) {
  if(minutes === null || minutes === undefined)return 'Non renseignée';
  const seconds=Math.round(minutes*60),hours=Math.floor(seconds/3600),mins=Math.floor(seconds%3600/60),rest=seconds%60;
  return `${hours} h${mins?` ${String(mins).padStart(2,'0')} min`:''}${rest?` ${rest} s`:''}`;
}
export function rowOrder(row) {
  if(!row.debutLocal)return Infinity;
  const value=Date.parse(row.debutLocal+(row.debutOffset||'Z'));
  return Number.isFinite(value)?value:Infinity;
}
