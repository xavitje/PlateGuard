-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'CHEF', 'COOK', 'WAITER', 'RUNNER');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INTOLERANCE', 'ALLERGY', 'SEVERE');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('CLEAR', 'CLEAR_WITH_NOTE', 'ADAPTABLE', 'CAUTION', 'UNKNOWN', 'DO_NOT_SERVE');

-- CreateEnum
CREATE TYPE "PlateStatus" AS ENUM ('ASSESSED', 'IN_KITCHEN', 'CHECKED', 'PASS_CHECKED', 'SERVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ServicePointKind" AS ENUM ('TABLE', 'ROOM', 'BAR_SEAT');

-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('ROUND', 'SQUARE', 'RECT');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('RESTAURANT', 'ROOM_SERVICE', 'BAR');

-- CreateEnum
CREATE TYPE "ServiceLevel" AS ENUM ('BASIC', 'STANDARD', 'FULL');

-- CreateEnum
CREATE TYPE "DishKind" AS ENUM ('MENU', 'DAILY_SPECIAL', 'AMUSE', 'BREAD');

-- CreateEnum
CREATE TYPE "ModificationAction" AS ENUM ('OMIT', 'SUBSTITUTE');

-- CreateEnum
CREATE TYPE "CheckKind" AS ENUM ('KITCHEN', 'PASS');

-- CreateEnum
CREATE TYPE "CheckMethod" AS ENUM ('SCAN', 'TAP', 'KDS');

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('POS', 'KDS', 'PRINTER');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'RESTAURANT',
    "level" "ServiceLevel" NOT NULL DEFAULT 'BASIC',
    "pass_check" BOOLEAN NOT NULL DEFAULT false,
    "drinks_in_scope" BOOLEAN NOT NULL DEFAULT false,
    "default_locale" TEXT NOT NULL DEFAULT 'en',
    "kitchen_locale" TEXT NOT NULL DEFAULT 'en',
    "guest_locales" TEXT[] DEFAULT ARRAY['en', 'nl']::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "password_hash" TEXT,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignment" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID,
    "role" "Role" NOT NULL,

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_pin" (
    "user_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "failed_tries" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "staff_pin_pkey" PRIMARY KEY ("user_id","location_id")
);

-- CreateTable
CREATE TABLE "allergen" (
    "code" TEXT NOT NULL,
    "parent_code" TEXT,
    "organization_id" UUID,
    "is_eu14" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "allergen_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "allergen_translation" (
    "allergen_code" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "organization_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "allergen_translation_pkey" PRIMARY KEY ("allergen_code","locale")
);

-- CreateTable
CREATE TABLE "ingredient" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "synonyms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supplier" TEXT,
    "brand" TEXT,
    "article_number" TEXT,
    "contains" TEXT[],
    "may_contain" TEXT[],
    "verified_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    "verified_source" TEXT,

    CONSTRAINT "ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "allergens" TEXT[],

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "omittable" BOOLEAN NOT NULL DEFAULT false,
    "premixed" BOOLEAN NOT NULL DEFAULT false,
    "suitable_for_severe" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_ingredient" (
    "component_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,

    CONSTRAINT "component_ingredient_pkey" PRIMARY KEY ("component_id","ingredient_id")
);

-- CreateTable
CREATE TABLE "component_equipment" (
    "component_id" UUID NOT NULL,
    "equipment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,

    CONSTRAINT "component_equipment_pkey" PRIMARY KEY ("component_id","equipment_id")
);

-- CreateTable
CREATE TABLE "component_child" (
    "parent_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,

    CONSTRAINT "component_child_pkey" PRIMARY KEY ("parent_id","child_id")
);

-- CreateTable
CREATE TABLE "substitution" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "replacement_id" UUID NOT NULL,
    "suitable_for_severe" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "substitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_translation" (
    "component_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "component_translation_pkey" PRIMARY KEY ("component_id","locale")
);

-- CreateTable
CREATE TABLE "dish" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "course" INTEGER NOT NULL DEFAULT 0,
    "price_cents" INTEGER,
    "kind" "DishKind" NOT NULL DEFAULT 'MENU',

    CONSTRAINT "dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dish_component" (
    "dish_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dish_component_pkey" PRIMARY KEY ("dish_id","component_id")
);

-- CreateTable
CREATE TABLE "dish_translation" (
    "dish_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "dish_translation_pkey" PRIMARY KEY ("dish_id","locale")
);

-- CreateTable
CREATE TABLE "menu" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_version" (
    "id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',
    "snapshot" JSONB,
    "pdf_url" TEXT,
    "published_at" TIMESTAMP(3),
    "published_by" UUID,

    CONSTRAINT "menu_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floor" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "version_status" "VersionStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_point" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "floor_id" UUID,
    "kind" "ServicePointKind" NOT NULL DEFAULT 'TABLE',
    "label" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "shape" "TableShape" NOT NULL DEFAULT 'SQUARE',
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "w" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "h" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "external_ref" TEXT,
    "qr_token" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floor_element" (
    "id" UUID NOT NULL,
    "floor_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "floor_element_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "service_point_id" UUID NOT NULL,
    "joined_point_ids" UUID[],
    "opened_by_id" UUID NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "anonymize_frozen" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "seat" INTEGER NOT NULL,
    "no_allergy" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_allergy" (
    "id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "allergen_code" TEXT,
    "ingredient_id" UUID,
    "custom_label" TEXT,
    "custom_key" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'SEVERE',
    "recorded_by_id" UUID NOT NULL,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMP(3),

    CONSTRAINT "guest_allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plate_order" (
    "id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "dish_id" UUID,
    "menu_version_id" UUID,
    "course" INTEGER NOT NULL,
    "status" "PlateStatus" NOT NULL,
    "remake_of_id" UUID,
    "qr_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plate_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment" (
    "id" UUID NOT NULL,
    "plate_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "outcome" "Outcome" NOT NULL,
    "reasons" JSONB NOT NULL,
    "input" JSONB NOT NULL,
    "engine_version" TEXT NOT NULL,
    "menu_version_id" UUID,
    "input_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plate_modification" (
    "id" UUID NOT NULL,
    "plate_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "action" "ModificationAction" NOT NULL,
    "substitute_id" UUID,
    "reason_allergens" TEXT[],

    CONSTRAINT "plate_modification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plate_check" (
    "id" UUID NOT NULL,
    "plate_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "kind" "CheckKind" NOT NULL,
    "by_user_id" UUID NOT NULL,
    "method" "CheckMethod" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plate_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "override" (
    "id" UUID NOT NULL,
    "plate_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "guest_consent" BOOLEAN NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "override_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" BIGSERIAL NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID,
    "actor_id" UUID,
    "type" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connection" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "capabilities" TEXT[],
    "encrypted_secrets" BYTEA,
    "config" JSONB NOT NULL DEFAULT '{}',
    "last_health_at" TIMESTAMP(3),
    "last_health_ok" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_item_mapping" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "external_item_id" TEXT NOT NULL,
    "dish_id" UUID,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "pos_item_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_ref" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "external_type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "plate_id" UUID NOT NULL,

    CONSTRAINT "external_ref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_event" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "inbound_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "location_id" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscription" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "encrypted_secret" BYTEA NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "outbox_event_id" UUID NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_status_code" INTEGER,
    "last_response" TEXT,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "location_slug_key" ON "location"("slug");

-- CreateIndex
CREATE INDEX "location_organization_id_idx" ON "location"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE INDEX "role_assignment_organization_id_location_id_idx" ON "role_assignment"("organization_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignment_user_id_organization_id_location_id_role_key" ON "role_assignment"("user_id", "organization_id", "location_id", "role");

-- CreateIndex
CREATE INDEX "ingredient_organization_id_idx" ON "ingredient"("organization_id");

-- CreateIndex
CREATE INDEX "equipment_organization_id_idx" ON "equipment"("organization_id");

-- CreateIndex
CREATE INDEX "component_organization_id_idx" ON "component"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "substitution_component_id_replacement_id_key" ON "substitution"("component_id", "replacement_id");

-- CreateIndex
CREATE INDEX "dish_location_id_idx" ON "dish"("location_id");

-- CreateIndex
CREATE INDEX "menu_location_id_idx" ON "menu"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_version_menu_id_version_key" ON "menu_version"("menu_id", "version");

-- CreateIndex
CREATE INDEX "floor_location_id_idx" ON "floor"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_point_qr_token_key" ON "service_point"("qr_token");

-- CreateIndex
CREATE INDEX "service_point_location_id_idx" ON "service_point"("location_id");

-- CreateIndex
CREATE INDEX "visit_location_id_opened_at_idx" ON "visit"("location_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "guest_visit_id_seat_key" ON "guest"("visit_id", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "guest_allergy_guest_id_allergen_code_key" ON "guest_allergy"("guest_id", "allergen_code");

-- CreateIndex
CREATE UNIQUE INDEX "guest_allergy_guest_id_ingredient_id_key" ON "guest_allergy"("guest_id", "ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_allergy_guest_id_custom_key_key" ON "guest_allergy"("guest_id", "custom_key");

-- CreateIndex
CREATE UNIQUE INDEX "plate_order_qr_token_key" ON "plate_order"("qr_token");

-- CreateIndex
CREATE INDEX "plate_order_location_id_status_idx" ON "plate_order"("location_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_plate_id_key" ON "assessment"("plate_id");

-- CreateIndex
CREATE INDEX "audit_event_location_id_at_idx" ON "audit_event"("location_id", "at");

-- CreateIndex
CREATE INDEX "audit_event_organization_id_at_idx" ON "audit_event"("organization_id", "at");

-- CreateIndex
CREATE INDEX "integration_connection_location_id_idx" ON "integration_connection"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_item_mapping_connection_id_external_item_id_key" ON "pos_item_mapping"("connection_id", "external_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_ref_connection_id_external_type_external_id_key" ON "external_ref"("connection_id", "external_type", "external_id");

-- CreateIndex
CREATE INDEX "inbound_event_status_received_at_idx" ON "inbound_event"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_event_connection_id_idempotency_key_key" ON "inbound_event"("connection_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_event_status_next_attempt_at_idx" ON "outbox_event"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "webhook_subscription_organization_id_idx" ON "webhook_subscription"("organization_id");

-- CreateIndex
CREATE INDEX "webhook_delivery_status_next_attempt_at_idx" ON "webhook_delivery"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_delivery_subscription_id_outbox_event_id_key" ON "webhook_delivery"("subscription_id", "outbox_event_id");

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_pin" ADD CONSTRAINT "staff_pin_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_pin" ADD CONSTRAINT "staff_pin_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergen" ADD CONSTRAINT "allergen_parent_code_fkey" FOREIGN KEY ("parent_code") REFERENCES "allergen"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergen" ADD CONSTRAINT "allergen_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergen_translation" ADD CONSTRAINT "allergen_translation_allergen_code_fkey" FOREIGN KEY ("allergen_code") REFERENCES "allergen"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component" ADD CONSTRAINT "component_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_ingredient" ADD CONSTRAINT "component_ingredient_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_ingredient" ADD CONSTRAINT "component_ingredient_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_equipment" ADD CONSTRAINT "component_equipment_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_equipment" ADD CONSTRAINT "component_equipment_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_child" ADD CONSTRAINT "component_child_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_child" ADD CONSTRAINT "component_child_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "component"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitution" ADD CONSTRAINT "substitution_replacement_id_fkey" FOREIGN KEY ("replacement_id") REFERENCES "component"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_translation" ADD CONSTRAINT "component_translation_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish" ADD CONSTRAINT "dish_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_component" ADD CONSTRAINT "dish_component_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_component" ADD CONSTRAINT "dish_component_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "component"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_translation" ADD CONSTRAINT "dish_translation_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu" ADD CONSTRAINT "menu_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_version" ADD CONSTRAINT "menu_version_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor" ADD CONSTRAINT "floor_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_point" ADD CONSTRAINT "service_point_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_point" ADD CONSTRAINT "service_point_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_element" ADD CONSTRAINT "floor_element_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit" ADD CONSTRAINT "visit_service_point_id_fkey" FOREIGN KEY ("service_point_id") REFERENCES "service_point"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest" ADD CONSTRAINT "guest_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_allergy" ADD CONSTRAINT "guest_allergy_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_allergy" ADD CONSTRAINT "guest_allergy_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plate_order" ADD CONSTRAINT "plate_order_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plate_order" ADD CONSTRAINT "plate_order_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plate_order" ADD CONSTRAINT "plate_order_remake_of_id_fkey" FOREIGN KEY ("remake_of_id") REFERENCES "plate_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_plate_id_fkey" FOREIGN KEY ("plate_id") REFERENCES "plate_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plate_modification" ADD CONSTRAINT "plate_modification_plate_id_fkey" FOREIGN KEY ("plate_id") REFERENCES "plate_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plate_check" ADD CONSTRAINT "plate_check_plate_id_fkey" FOREIGN KEY ("plate_id") REFERENCES "plate_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "override" ADD CONSTRAINT "override_plate_id_fkey" FOREIGN KEY ("plate_id") REFERENCES "plate_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_item_mapping" ADD CONSTRAINT "pos_item_mapping_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_ref" ADD CONSTRAINT "external_ref_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_ref" ADD CONSTRAINT "external_ref_plate_id_fkey" FOREIGN KEY ("plate_id") REFERENCES "plate_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbound_event" ADD CONSTRAINT "inbound_event_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "webhook_subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A guest allergy is exactly one of: a known allergen, an ingredient from the list, or a custom label.
ALTER TABLE "guest_allergy" ADD CONSTRAINT "guest_allergy_exactly_one_kind" CHECK (
  num_nonnulls("allergen_code", "ingredient_id", "custom_label") = 1
  AND ("custom_label" IS NULL) = ("custom_key" IS NULL)
  AND ("custom_label" IS NULL OR length(trim("custom_label")) > 0)
);
