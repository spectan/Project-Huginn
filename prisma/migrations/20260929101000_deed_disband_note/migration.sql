-- Links a disbanded deed to the "Abandoned Deed" note created in its place.
ALTER TABLE "deeds" ADD COLUMN "disbandNoteId" TEXT;
