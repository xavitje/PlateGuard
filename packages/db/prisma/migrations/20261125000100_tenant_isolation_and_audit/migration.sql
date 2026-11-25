-- Tenant isolation with row-level security, and the append-only audit trail.
--
-- The API runs every tenant query inside a transaction that does
--   SET LOCAL ROLE plateguard_app;
--   SELECT set_config('app.org_id', '<org uuid>', true);
--   SELECT set_config('app.location_ids', '<uuid>,<uuid>', true);
--   SELECT set_config('app.user_id', '<user uuid>', true);
-- plateguard_app does not own the tables, so the policies below always apply to it.
-- Without those settings it sees nothing. Migrations and seed run as the table owner.

-- ─── Role ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plateguard_app') THEN
    CREATE ROLE plateguard_app NOLOGIN;
  END IF;
END $$;

-- The migrating user may switch to the app role (SET LOCAL ROLE). A separate runtime login
-- only needs: GRANT plateguard_app TO <login>.
GRANT plateguard_app TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO plateguard_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plateguard_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO plateguard_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plateguard_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO plateguard_app;
REVOKE ALL ON "_prisma_migrations" FROM plateguard_app;

-- ─── Session helpers ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_org_id() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_location_ids() RETURNS uuid[]
  LANGUAGE sql STABLE AS
$$ SELECT coalesce(string_to_array(nullif(current_setting('app.location_ids', true), ''), ',')::uuid[], '{}') $$;

-- ─── Organization-scoped tables ────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'role_assignment', 'ingredient', 'equipment', 'component', 'component_ingredient',
    'component_equipment', 'component_child', 'substitution', 'component_translation',
    'outbox_event', 'webhook_subscription', 'webhook_delivery'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id())',
      t);
  END LOOP;
END $$;

-- ─── Location-scoped tables ────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'staff_pin', 'dish', 'dish_component', 'dish_translation', 'menu', 'menu_version',
    'floor', 'service_point', 'floor_element', 'visit', 'guest', 'guest_allergy',
    'plate_order', 'assessment', 'plate_modification', 'plate_check', 'override',
    'pos_item_mapping', 'external_ref', 'inbound_event'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (location_id = ANY (app_location_ids())) WITH CHECK (location_id = ANY (app_location_ids()))',
      t);
  END LOOP;
END $$;

-- Both checks: the organization and the location.
ALTER TABLE integration_connection ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON integration_connection
  USING (organization_id = app_org_id() AND location_id = ANY (app_location_ids()))
  WITH CHECK (organization_id = app_org_id() AND location_id = ANY (app_location_ids()));

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organization
  USING (id = app_org_id()) WITH CHECK (id = app_org_id());

ALTER TABLE location ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON location
  USING (organization_id = app_org_id() AND id = ANY (app_location_ids()))
  WITH CHECK (organization_id = app_org_id());

-- Audit rows without a location (organization-level actions) are visible organization wide.
ALTER TABLE audit_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_event
  USING (organization_id = app_org_id() AND (location_id IS NULL OR location_id = ANY (app_location_ids())))
  WITH CHECK (organization_id = app_org_id() AND (location_id IS NULL OR location_id = ANY (app_location_ids())));

-- EU-14 allergens (organization_id NULL) are readable by everyone, writable by no tenant.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['allergen', 'allergen_translation'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY read_shared_or_own ON %I FOR SELECT USING (organization_id IS NULL OR organization_id = app_org_id())', t);
    EXECUTE format('CREATE POLICY write_own ON %I FOR INSERT WITH CHECK (organization_id = app_org_id())', t);
    EXECUTE format('CREATE POLICY update_own ON %I FOR UPDATE USING (organization_id = app_org_id()) WITH CHECK (organization_id = app_org_id())', t);
    EXECUTE format('CREATE POLICY delete_own ON %I FOR DELETE USING (organization_id = app_org_id())', t);
  END LOOP;
END $$;

-- Users are global identities. A tenant sees itself and the people with a role in its
-- organization (role_assignment is itself filtered by organization).
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_in_tenant ON app_user FOR SELECT
  USING (id = app_user_id() OR EXISTS (SELECT 1 FROM role_assignment ra WHERE ra.user_id = app_user.id));
CREATE POLICY update_in_tenant ON app_user FOR UPDATE
  USING (id = app_user_id() OR EXISTS (SELECT 1 FROM role_assignment ra WHERE ra.user_id = app_user.id));
CREATE POLICY create_user ON app_user FOR INSERT WITH CHECK (true);

-- ─── Append-only: audit trail and assessments ──────────────────────────────
CREATE OR REPLACE FUNCTION reject_change() RETURNS trigger
  LANGUAGE plpgsql AS
$$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE TRIGGER audit_event_append_only
  BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER audit_event_no_truncate
  BEFORE TRUNCATE ON audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

CREATE TRIGGER assessment_append_only
  BEFORE UPDATE OR DELETE ON assessment
  FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER assessment_no_truncate
  BEFORE TRUNCATE ON assessment
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

REVOKE UPDATE, DELETE, TRUNCATE ON audit_event, assessment FROM plateguard_app;
