export {dateHeureFr as formatParis,dureeMinutesFr as durationLabel,plageFr} from '../../../shared/format-fr.mjs';
export function rowOrder(row) {
  if(!row.debutLocal)return Infinity;
  const value=Date.parse(row.debutLocal+(row.debutOffset||'Z'));
  return Number.isFinite(value)?value:Infinity;
}
