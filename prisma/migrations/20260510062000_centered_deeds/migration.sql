ALTER TABLE "deeds"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "north" INTEGER,
  ADD COLUMN "west" INTEGER,
  ADD COLUMN "east" INTEGER,
  ADD COLUMN "south" INTEGER;

UPDATE "deeds"
SET
  "name" = "founder",
  "x" = "x" + (("width" - 1) / 2),
  "y" = "y" + (("height" - 1) / 2),
  "west" = (("width" - 1) / 2),
  "east" = ("width" - 1) - (("width" - 1) / 2),
  "north" = (("height" - 1) / 2),
  "south" = ("height" - 1) - (("height" - 1) / 2);

ALTER TABLE "deeds"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "north" SET NOT NULL,
  ALTER COLUMN "west" SET NOT NULL,
  ALTER COLUMN "east" SET NOT NULL,
  ALTER COLUMN "south" SET NOT NULL,
  DROP COLUMN "width",
  DROP COLUMN "height";
