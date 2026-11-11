import { Temporal } from '@js-temporal/polyfill';

export const parisZone = 'Europe/Paris';
// Le formulaire accepte aussi les secondes/millisecondes pour préserver des instants existants.
const localPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;
export function parisInstant(local, offset = '') {
  if (!localPattern.test(local)) return { field: 'Local', error: 'Saisissez une date et une heure locales valides.' };
  let plain;
  try { plain = Temporal.PlainDateTime.from(local, { overflow: 'reject' }); }
  catch { return { field: 'Local', error: 'Cette date ou cette heure n’existe pas.' }; }
  if (plain.year < 2000 || plain.year > 2199) return { field: 'Local', error: 'Choisissez une date comprise entre 2000 et 2199.' };
  const earlier = plain.toZonedDateTime(parisZone, { disambiguation: 'earlier' });
  const later = plain.toZonedDateTime(parisZone, { disambiguation: 'later' });
  const candidates = [earlier, later].filter((value, index, all) => value.toPlainDateTime().equals(plain) && !all.slice(0,index).some(other => other.epochMilliseconds === value.epochMilliseconds));
  if (!candidates.length) return { field: 'Local', error: 'Heure inexistante à Paris lors du passage à l’heure d’été. Choisissez une autre heure.' };
  if (candidates.length > 1 && !offset) return { field: 'Offset', error: 'Heure ambiguë à Paris : précisez UTC+02:00 (première occurrence) ou UTC+01:00 (seconde occurrence).' };
  const chosen = offset ? candidates.find(candidate => candidate.offset === offset) : candidates[0];
  if (!chosen) return { field: 'Offset', error: 'Ce décalage ne correspond pas à cette heure de Paris. Choisissez Automatique ou le décalage applicable.' };
  return { instant: new Date(chosen.epochMilliseconds) };
}
export function parisInput(instant) {
  const date = Temporal.Instant.from(instant.toISOString()).toZonedDateTimeISO(parisZone);
  return { local: date.toPlainDateTime().toString(), offset: date.offset };
}
