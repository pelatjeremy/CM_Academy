export const categoriesQuestionnaire={POSITIONNEMENT:'Positionnement',SATISFACTION_CHAUD:'Satisfaction à chaud',SATISFACTION_FROID:'Satisfaction à froid'};
export const typesQuestion={TEXTE_COURT:'Texte court',TEXTE_LONG:'Texte long',CHOIX_UNIQUE:'Choix unique',CHOIX_MULTIPLE:'Choix multiple',NOTE:'Note de 1 à 5'};
export const etatsQuestionnaire={A_COMPLETER:'À compléter',BROUILLON:'Brouillon',ENVOYE:'Envoyé',RETIRE:'Retiré'};
export function reponsesObligatoires(questions,values){
 const fields={};
 for(const q of questions){const v=values[q.id];if(q.obligatoire&&(v===undefined||v===null||v===''||(typeof v==='string'&&!v.trim())||(Array.isArray(v)&&!v.length)))fields[q.id]='Cette réponse est obligatoire.';}
 return fields;
}
