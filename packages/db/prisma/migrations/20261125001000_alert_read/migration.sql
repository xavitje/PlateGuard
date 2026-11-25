-- CreateTable
CREATE TABLE "alert_read" (
    "user_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "alert_key" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_read_pkey" PRIMARY KEY ("user_id","location_id","alert_key")
);

-- AddForeignKey
ALTER TABLE "alert_read" ADD CONSTRAINT "alert_read_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE alert_read ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON alert_read
  USING (location_id = ANY (app_location_ids()))
  WITH CHECK (location_id = ANY (app_location_ids()));
