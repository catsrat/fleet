-- The contract is now a signed round trip: we issue it, the rider uploads the copy they signed,
-- then we upload the countersigned one. Each copy is stored encrypted like any other document.
ALTER TABLE "Contract"
  ADD COLUMN "riderSignedKey"         TEXT,
  ADD COLUMN "riderSignedAt"          TIMESTAMP(3),
  ADD COLUMN "riderSignedSha256"      TEXT,
  ADD COLUMN "riderSignedSizeBytes"   INTEGER,
  ADD COLUMN "countersignedKey"       TEXT,
  ADD COLUMN "countersignedAt"        TIMESTAMP(3),
  ADD COLUMN "countersignedSha256"    TEXT,
  ADD COLUMN "countersignedSizeBytes" INTEGER,
  ADD COLUMN "countersignedByName"    TEXT;
