-- The app_user a platform admin acts as when opening a restaurant as its owner.
ALTER TABLE "platform_admin" ADD COLUMN "user_id" UUID;
CREATE UNIQUE INDEX "platform_admin_user_id_key" ON "platform_admin"("user_id");
ALTER TABLE "platform_admin" ADD CONSTRAINT "platform_admin_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
