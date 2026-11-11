BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL TIME ZONE 'UTC';
CREATE TYPE "CategorieDocumentaire" AS ENUM (
    'ENTRETIEN_INITIAL', 'POSITIONNEMENT', 'CONVENTION_CONTRAT', 'REGLEMENT_INTERIEUR',
    'PROGRAMME', 'EMARGEMENT', 'EVALUATIONS', 'SATISFACTION_CHAUD', 'SATISFACTION_FROID', 'ATTESTATION'
);
CREATE TYPE "EtatDocumentaire" AS ENUM ('A_PREPARER', 'EN_ATTENTE', 'RECU', 'VERIFIE', 'NON_APPLICABLE');

CREATE TABLE "DossierAdministratif" (
    "inscriptionId" TEXT PRIMARY KEY REFERENCES "Inscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "parcoursDocumentaire" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ElementDocumentaire" (
    "inscriptionId" TEXT NOT NULL REFERENCES "DossierAdministratif"("inscriptionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    "categorie" "CategorieDocumentaire" NOT NULL,
    "etat" "EtatDocumentaire" NOT NULL DEFAULT 'A_PREPARER',
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    PRIMARY KEY ("inscriptionId", "categorie")
);

CREATE TABLE "ChangementDocumentaire" (
    "id" TEXT PRIMARY KEY,
    "inscriptionId" TEXT NOT NULL,
    "categorie" "CategorieDocumentaire" NOT NULL,
    "ancienEtat" "EtatDocumentaire" NOT NULL,
    "nouvelEtat" "EtatDocumentaire" NOT NULL,
    "ancienneNote" VARCHAR(500) NOT NULL,
    "nouvelleNote" VARCHAR(500) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auteurId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("inscriptionId", "categorie")
        REFERENCES "ElementDocumentaire"("inscriptionId", "categorie") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ChangementDocumentaire_inscriptionId_categorie_date_idx"
    ON "ChangementDocumentaire" ("inscriptionId", "categorie", "date");
CREATE INDEX "ChangementDocumentaire_auteurId_idx" ON "ChangementDocumentaire" ("auteurId");

-- Configuration figée pour tous les statuts d'inscription, sans copier de coordonnées.
-- Le conflit n'écrase jamais un dossier déjà initialisé.
INSERT INTO "DossierAdministratif" ("inscriptionId", "parcoursDocumentaire", "updatedAt")
SELECT i.id, f."parcoursDocumentaire", CURRENT_TIMESTAMP
FROM "Inscription" i
JOIN "Session" s ON s.id = i."sessionId"
JOIN "Formation" f ON f.id = s."formationId"
ON CONFLICT ("inscriptionId") DO NOTHING;

INSERT INTO "ElementDocumentaire" ("inscriptionId", "categorie")
SELECT d."inscriptionId", c.categorie
FROM "DossierAdministratif" d
CROSS JOIN unnest(enum_range(NULL::"CategorieDocumentaire")) AS c(categorie)
WHERE d."parcoursDocumentaire"
ON CONFLICT ("inscriptionId", "categorie") DO NOTHING;
COMMIT;
