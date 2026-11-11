export const etatsPresence={NON_RENSEIGNE:'Non renseigné',PRESENT:'Présent',PARTIEL:'Partiellement présent',ABSENT:'Absent'};
import {dureeFr} from '../../../shared/format-fr.mjs';
export const dureePresence=ms=>dureeFr(ms,'Durée inconnue');
