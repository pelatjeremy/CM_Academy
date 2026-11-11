BEGIN;
LOCK TABLE "ModeleQuestionnaire","QuestionnaireAttribue" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "QuestionnaireAttribue") OR EXISTS(SELECT 1 FROM "ModeleQuestionnaire") THEN
 RAISE EXCEPTION 'Retour arrière refusé : modèles ou questionnaires présents.';
 END IF;
END $$;
DROP TABLE "QuestionnaireAttribue","ModeleQuestionnaire";
DROP TYPE "EtatQuestionnaire","CategorieQuestionnaire";
COMMIT;
