BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "ElementDocumentaire" ADD COLUMN "fichierRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ElementDocumentaire" ADD CONSTRAINT "ElementDocumentaire_revision_positive" CHECK ("fichierRevision" >= 0);
CREATE TABLE "PieceJointe" (
    "id" TEXT PRIMARY KEY,
    "inscriptionId" TEXT NOT NULL,
    "categorie" "CategorieDocumentaire" NOT NULL,
    "version" INTEGER NOT NULL CHECK ("version" > 0),
    "depotId" UUID NOT NULL,
    "stockageKey" UUID NOT NULL,
    "nomOriginal" VARCHAR(255) NOT NULL CHECK (length("nomOriginal") > 0 AND "nomOriginal" !~ '[[:cntrl:]]'),
    "taille" INTEGER NOT NULL CHECK ("taille" > 0),
    "typeMime" VARCHAR(32) NOT NULL CHECK ("typeMime" IN ('application/pdf','image/jpeg','image/png')),
    "empreinte" CHAR(64) NOT NULL CHECK ("empreinte" ~ '^[a-f0-9]{64}$'),
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auteurId" TEXT NOT NULL REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("inscriptionId", "categorie") REFERENCES "ElementDocumentaire"("inscriptionId", "categorie")
        ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PieceJointe_depotId_key" ON "PieceJointe" ("depotId");
CREATE UNIQUE INDEX "PieceJointe_stockageKey_key" ON "PieceJointe" ("stockageKey");
CREATE UNIQUE INDEX "PieceJointe_inscriptionId_categorie_version_key" ON "PieceJointe" ("inscriptionId", "categorie", "version");
CREATE INDEX "PieceJointe_auteurId_idx" ON "PieceJointe" ("auteurId");
COMMIT;
