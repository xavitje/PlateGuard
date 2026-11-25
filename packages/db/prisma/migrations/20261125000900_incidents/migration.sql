-- CreateEnum
CREATE TYPE "IncidentKind" AS ENUM ('REACTION', 'NEAR_MISS', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "incident" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "visit_id" UUID,
    "plate_id" UUID,
    "table_label" TEXT NOT NULL,
    "seat" INTEGER,
    "kind" "IncidentKind" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "reported_by_id" UUID NOT NULL,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "cause" TEXT,
    "measure" TEXT,
    "closed_by_id" UUID,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_location_id_reported_at_idx" ON "incident"("location_id", "reported_at");

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_plate_id_fkey" FOREIGN KEY ("plate_id") REFERENCES "plate_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE incident ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON incident
  USING (location_id = ANY (app_location_ids()))
  WITH CHECK (location_id = ANY (app_location_ids()));
