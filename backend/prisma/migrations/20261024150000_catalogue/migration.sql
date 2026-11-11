-- Migration préparée uniquement : ne pas exécuter sans validation explicite.
-- Base inspectée : PostgreSQL 18.6, schéma public, Formation de la migration
-- 20261022174525_creation_formations. Aucun INSERT / UPDATE / DELETE ni seed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TYPE "public"."FormatFormation" AS ENUM ('WEBINAIRE', 'PRESENTIEL', 'HYBRIDE');

CREATE TABLE "public"."Pole" (
    "id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pole_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Pole_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE TABLE "public"."Formateur" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "biographie" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Formateur_pkey" PRIMARY KEY ("id")
);

-- Les champs ajoutés acceptent les fiches historiques/incomplètes.
-- Aucun slug ni pôle n'est inventé pour les lignes existantes.
ALTER TABLE "public"."Formation"
    ADD COLUMN "slug" TEXT,
    ADD COLUMN "resume" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "objectifs" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "programme" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "publicVise" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "prerequis" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "dureeMinutes" INTEGER,
    ADD COLUMN "format" "public"."FormatFormation",
    ADD COLUMN "tarif" DECIMAL(12,2),
    ADD COLUMN "devise" CHAR(3) NOT NULL DEFAULT 'EUR',
    ADD COLUMN "financement" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "parcoursDocumentaire" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "poleId" TEXT,
    ADD CONSTRAINT "Formation_slug_format_check" CHECK ("slug" IS NULL OR "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    ADD CONSTRAINT "Formation_dureeMinutes_check" CHECK ("dureeMinutes" IS NULL OR "dureeMinutes" > 0),
    ADD CONSTRAINT "Formation_tarif_check" CHECK ("tarif" IS NULL OR ("tarif" >= 0 AND "tarif" <> 'NaN'::numeric)),
    ADD CONSTRAINT "Formation_devise_check" CHECK ("devise" ~ '^[A-Z]{3}$');

CREATE TABLE "public"."FormationFormateur" (
    "formationId" TEXT NOT NULL,
    "formateurId" TEXT NOT NULL,
    CONSTRAINT "FormationFormateur_pkey" PRIMARY KEY ("formationId", "formateurId")
);

CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "formationId" TEXT NOT NULL,
    "capacite" INTEGER,
    "lieu" TEXT,
    "modalitesPratiques" TEXT NOT NULL DEFAULT '',
    "fuseauHoraire" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Session_capacite_check" CHECK ("capacite" IS NULL OR "capacite" > 0),
    CONSTRAINT "Session_fuseauHoraire_check" CHECK (length(btrim("fuseauHoraire")) > 0)
);

CREATE TABLE "public"."Seance" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "debut" TIMESTAMPTZ(3) NOT NULL,
    "fin" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Seance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Seance_dates_check" CHECK (isfinite("debut") AND isfinite("fin") AND "fin" > "debut")
);

-- Séparation explicite des modalités publiques et des accès confidentiels.
CREATE TABLE "public"."SessionAccesPrive" (
    "sessionId" TEXT NOT NULL,
    "lienVisioconference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionAccesPrive_pkey" PRIMARY KEY ("sessionId"),
    CONSTRAINT "SessionAccesPrive_lien_check" CHECK (length(btrim("lienVisioconference")) > 0)
);

CREATE UNIQUE INDEX "Pole_slug_key" ON "public"."Pole"("slug");
CREATE UNIQUE INDEX "Formation_slug_key" ON "public"."Formation"("slug");
CREATE INDEX "Formation_poleId_idx" ON "public"."Formation"("poleId");
CREATE INDEX "FormationFormateur_formateurId_idx" ON "public"."FormationFormateur"("formateurId");
CREATE INDEX "Session_formationId_idx" ON "public"."Session"("formationId");
CREATE INDEX "Seance_sessionId_debut_idx" ON "public"."Seance"("sessionId", "debut");

ALTER TABLE "public"."Formation" ADD CONSTRAINT "Formation_poleId_fkey"
    FOREIGN KEY ("poleId") REFERENCES "public"."Pole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."FormationFormateur" ADD CONSTRAINT "FormationFormateur_formationId_fkey"
    FOREIGN KEY ("formationId") REFERENCES "public"."Formation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."FormationFormateur" ADD CONSTRAINT "FormationFormateur_formateurId_fkey"
    FOREIGN KEY ("formateurId") REFERENCES "public"."Formateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_formationId_fkey"
    FOREIGN KEY ("formationId") REFERENCES "public"."Formation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Seance" ADD CONSTRAINT "Seance_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."SessionAccesPrive" ADD CONSTRAINT "SessionAccesPrive_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "public"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
