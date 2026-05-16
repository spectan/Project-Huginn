ALTER TABLE "note_categories" ADD COLUMN "color" TEXT;
ALTER TABLE "note_categories" ADD COLUMN "markerShape" TEXT NOT NULL DEFAULT 'circle';
ALTER TABLE "note_categories" ADD COLUMN "pipSize" INTEGER NOT NULL DEFAULT 3;
