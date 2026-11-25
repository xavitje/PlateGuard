-- The kitchen sends a plate back to the waiter with a reason.
ALTER TABLE "plate_order" ADD COLUMN "reject_reason" TEXT,
ADD COLUMN "rejected_at" TIMESTAMP(3);
