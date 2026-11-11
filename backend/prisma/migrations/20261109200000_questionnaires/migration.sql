BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TYPE "CategorieQuestionnaire" AS ENUM ('POSITIONNEMENT','SATISFACTION_CHAUD','SATISFACTION_FROID');
CREATE TYPE "EtatQuestionnaire" AS ENUM ('A_COMPLETER','BROUILLON','ENVOYE','RETIRE');
CREATE TABLE "ModeleQuestionnaire" (
 "id" TEXT PRIMARY KEY, "titre" VARCHAR(160) NOT NULL,
 "categorie" "CategorieQuestionnaire" NOT NULL, "questions" JSONB NOT NULL DEFAULT '[]',
 "valide" BOOLEAN NOT NULL DEFAULT false, "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision">=0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "auteurId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "modifieParId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK (length(trim("titre"))>0), CHECK (jsonb_typeof("questions")='array' AND jsonb_array_length("questions")<=40)
);
CREATE INDEX "ModeleQuestionnaire_auteurId_idx" ON "ModeleQuestionnaire"("auteurId");
CREATE INDEX "ModeleQuestionnaire_modifieParId_idx" ON "ModeleQuestionnaire"("modifieParId");
CREATE TABLE "QuestionnaireAttribue" (
 "id" TEXT PRIMARY KEY,
 "inscriptionId" TEXT NOT NULL REFERENCES "DossierAdministratif"("inscriptionId") ON DELETE RESTRICT ON UPDATE CASCADE,
 "modeleId" TEXT NOT NULL REFERENCES "ModeleQuestionnaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "modeleRevision" INTEGER NOT NULL CHECK ("modeleRevision">=0),
 "requeteId" UUID NOT NULL UNIQUE,
 "titre" VARCHAR(160) NOT NULL, "categorie" "CategorieQuestionnaire" NOT NULL, "questions" JSONB NOT NULL,
 "reponses" JSONB NOT NULL DEFAULT '{}', "etat" "EtatQuestionnaire" NOT NULL DEFAULT 'A_COMPLETER',
 "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision">=0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 "auteurId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "retireAt" TIMESTAMP(3), "retireParId" TEXT REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "soumisAt" TIMESTAMP(3), "soumisParId" TEXT REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "brouillonAt" TIMESTAMP(3), "brouillonParId" TEXT REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK (jsonb_typeof("questions")='array' AND jsonb_array_length("questions") BETWEEN 1 AND 40),
 CHECK (jsonb_typeof("reponses")='object'),
 CHECK (("etat"='ENVOYE') = ("soumisAt" IS NOT NULL AND "soumisParId" IS NOT NULL)),
 CHECK (("soumisAt" IS NULL)=("soumisParId" IS NULL)),
 CHECK (("etat"='RETIRE') = ("retireAt" IS NOT NULL AND "retireParId" IS NOT NULL)),
 CHECK (("retireAt" IS NULL)=("retireParId" IS NULL))
);
CREATE UNIQUE INDEX "QuestionnaireAttribue_actif_unique" ON "QuestionnaireAttribue"("inscriptionId","modeleId") WHERE "etat"<>'RETIRE';
CREATE INDEX "QuestionnaireAttribue_inscriptionId_createdAt_idx" ON "QuestionnaireAttribue"("inscriptionId","createdAt");
CREATE INDEX "QuestionnaireAttribue_modeleId_idx" ON "QuestionnaireAttribue"("modeleId");
CREATE INDEX "QuestionnaireAttribue_auteurId_idx" ON "QuestionnaireAttribue"("auteurId");
CREATE INDEX "QuestionnaireAttribue_retireParId_idx" ON "QuestionnaireAttribue"("retireParId");
CREATE INDEX "QuestionnaireAttribue_soumisParId_idx" ON "QuestionnaireAttribue"("soumisParId");
CREATE INDEX "QuestionnaireAttribue_brouillonParId_idx" ON "QuestionnaireAttribue"("brouillonParId");
COMMIT;
