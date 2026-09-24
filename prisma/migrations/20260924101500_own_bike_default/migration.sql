-- Couriers ride their own pedelecs; a fleet bike is the exception, not the rule.
-- The old default silently skipped the BIKE_PHOTO checklist (bike + rating plate),
-- which is the only proof a rider is not on an S-Pedelec.
ALTER TABLE "Rider" ALTER COLUMN "bikeMode" SET DEFAULT 'OWN_BIKE';
