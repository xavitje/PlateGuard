-- The draft menu: which dishes, in which order. Publishing freezes them into menu_version.snapshot.
CREATE TABLE "menu_item" (
    "menu_id" UUID NOT NULL,
    "dish_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_pkey" PRIMARY KEY ("menu_id","dish_id")
);

ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE menu_item ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON menu_item
  USING (location_id = ANY (app_location_ids()))
  WITH CHECK (location_id = ANY (app_location_ids()));
