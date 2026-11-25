-- Allergy tickets for a kitchen printer. The printer fetches its jobs (Star CloudPRNT), so a job
-- waits here until the printer asks for it and reports back. A job holds the plate, not the
-- text: the ticket is drawn when the printer fetches it, with the guest's current allergies.
CREATE TYPE "PrintJobKind" AS ENUM ('TICKET', 'REPRINT', 'TEST');
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'SENT', 'PRINTED', 'FAILED');

CREATE TABLE "print_job" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "plate_id" UUID,
    "kind" "PrintJobKind" NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "printed_at" TIMESTAMP(3),

    CONSTRAINT "print_job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "print_job_connection_id_status_created_at_idx" ON "print_job"("connection_id", "status", "created_at");

ALTER TABLE "print_job" ADD CONSTRAINT "print_job_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "print_job" ADD CONSTRAINT "print_job_plate_id_fkey" FOREIGN KEY ("plate_id") REFERENCES "plate_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE print_job ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON print_job
  USING (location_id = ANY (app_location_ids()))
  WITH CHECK (location_id = ANY (app_location_ids()));

-- A printer is named in admin ("Kitchen", "Grill").
ALTER TABLE "integration_connection" ADD COLUMN "name" TEXT;
