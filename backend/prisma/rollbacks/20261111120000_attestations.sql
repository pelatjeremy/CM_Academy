BEGIN;
LOCK TABLE "AttestationEmission","OrganismeAttestation" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM "AttestationEmission") OR EXISTS(SELECT 1 FROM "OrganismeAttestation") THEN
  RAISE EXCEPTION 'Retour arriere refuse : emissions ou configuration presentes. Conserver les fichiers et restaurer conjointement si necessaire.';
 END IF;
END $$;
DROP TABLE "AttestationEmission","OrganismeAttestation";
DROP FUNCTION proteger_attestation();
COMMIT;
