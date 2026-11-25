-- Table size on the floor plan, in percent of the drawing's width. Null: sized from its seats.
-- Nothing set w or h before, so every row holds the old column default and becomes null.
ALTER TABLE "service_point" ALTER COLUMN "w" DROP NOT NULL, ALTER COLUMN "w" DROP DEFAULT;
ALTER TABLE "service_point" ALTER COLUMN "h" DROP NOT NULL, ALTER COLUMN "h" DROP DEFAULT;
UPDATE "service_point" SET "w" = NULL, "h" = NULL;
