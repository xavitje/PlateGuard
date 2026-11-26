-- Platform admins: the people who run PlateGuard itself, apart from every restaurant.
CREATE TABLE "platform_admin" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "totp_secret" TEXT NOT NULL,
    "totp_last_step" INTEGER,
    "failed_tries" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_admin_email_key" ON "platform_admin"("email");

-- Tenant queries run as plateguard_app; they must never reach platform admins. Only the owner
-- connection (login lookups, the platform-admin script) reads this table. Row-level security
-- without a policy refuses every row to any other role as a second lock.
REVOKE ALL ON "platform_admin" FROM plateguard_app;
ALTER TABLE "platform_admin" ENABLE ROW LEVEL SECURITY;
