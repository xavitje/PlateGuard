-- Why the waiter ordered a dish the engine marked "do not serve" for this guest.
ALTER TABLE "plate_order" ADD COLUMN "waiter_note" TEXT;
