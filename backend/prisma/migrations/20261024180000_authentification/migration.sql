BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TYPE "public"."RoleUtilisateur" AS ENUM ('ADMIN', 'MEMBRE');
CREATE TABLE "public"."Utilisateur" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "role" "public"."RoleUtilisateur" NOT NULL DEFAULT 'MEMBRE',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Utilisateur_email_normalise_check" CHECK ("email" = lower(btrim("email")) AND length("email") BETWEEN 3 AND 254)
);
CREATE UNIQUE INDEX "Utilisateur_email_key" ON "public"."Utilisateur"("email");
CREATE TABLE "public"."AuthSession" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX "AuthSession_expire_idx" ON "public"."AuthSession"("expire");
COMMIT;
