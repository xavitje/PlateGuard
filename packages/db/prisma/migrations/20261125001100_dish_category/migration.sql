-- Where a dish sits in the waiter's grid: a category, optionally a subcategory under it.
ALTER TABLE "dish" ADD COLUMN "category" TEXT;
ALTER TABLE "dish" ADD COLUMN "subcategory" TEXT;
