# PlateGuard

PlateGuard is an allergen engine with a kitchen check. It runs next to the existing POS and only asks for
work at tables with an allergy. The recipe per component is the source of truth: the engine judges every
dish per guest, puts the required changes on the allergy ticket, and the cook confirms the plate with one
scan before it leaves the kitchen.

This repository is the project skeleton: monorepo and tooling, the database schema with tenant isolation,
the allergen engine with tests, English and Dutch translations, and app shells in house style v3. Most
features arrive in the phases of the build plan.

## Layout

```
apps/
  web/            React PWA: Tables, Alerts and Profile tabs, full-screen kitchen view, admin, guest menu
  api/            NestJS, one process: controllers -> services -> repositories
    src/integrations/
      core/       ports (POS, KDS, printer), adapter registry, inbox, outbox, webhook signatures
      adapters/   one folder per provider (fake-pos for tests; lightspeed-k, mplus, escpos-print later)
packages/
  domain/         the allergen engine, allergen taxonomy and permissions. Pure TypeScript, no I/O
  contracts/      Zod schemas for the API, webhook events and the canonical integration format
  db/             Prisma schema, migrations (row-level security, append-only audit), seed, tenant client
  i18n/           translation files per locale and namespace, i18next setup, CI check
  design-tokens/  house style v3 as CSS variables, plus the same values for TypeScript
```

## Getting started

Needs Node 22.12 or newer, pnpm 10 and PostgreSQL 16 (`docker compose up -d` starts one).

```sh
pnpm install
cp .env.example .env            # DATABASE_URL for migrations, seed and the API
pnpm db:migrate                 # schema, row-level security, audit triggers
pnpm db:seed                    # EU-14 allergens, plus a demo restaurant with two tables in service
pnpm dev:api                    # http://localhost:3000/api/health
pnpm dev:web                    # http://localhost:5173, sign in as Demo Waiter with PIN 1234
```

The seed sets two development PINs on the demo location: Demo Waiter 1234 and Demo Owner 2580. The seed only fills
an empty demo location; `pnpm db:reset` rebuilds a development database from scratch and deletes all
its data, so never point it at a real one.

Checks, as CI runs them: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm i18n:check`, `pnpm test`
(the database tests run when `DATABASE_URL` is set) and `pnpm build`.

## Hosting: Vercel and Supabase

The test environment runs without anything on your own machine: the app and the API on Vercel, the
database on Supabase Postgres in Frankfurt (eu-central-1).

- **One Vercel project** serves both. The PWA is a static build (`apps/web/dist`). The whole NestJS
  API is one Vercel function, `api/index.js`, which loads `apps/api/dist/serverless.js`: the Nest app
  is built once per function instance and reused. `vercel.json` sends `/api/*` and `/hooks/*` to that
  function and every other path to the app, so the browser talks to the API on the same domain, as
  with the Vite proxy in development. Functions run in Frankfurt (`fra1`), next to the database.
- **The database** is owned by the login role `plateguard_owner`, not by Supabase's `postgres`, so
  row-level security works exactly as described below: the API switches to `plateguard_app` per
  transaction, and the owner only runs migrations, the seed and the few lookups before a tenant is
  known. Migration `20261125000400_hosted_postgres_lockdown` takes every right away from Supabase's
  Data API roles (`anon`, `authenticated`): PlateGuard data is only reachable through the PlateGuard API.
- **Connections.** The function connects through the Supavisor transaction pooler (port 6543) with
  `?pgbouncer=true&connection_limit=1`: one connection per instance, and the pooler shares them.
  `withTenant()` only uses `SET LOCAL` and `set_config(..., true)` inside one transaction, which is
  what a transaction pooler supports. Migrations and the seed need the session pooler (port 5432).

Environment variables, set in Vercel (never in the repository):

| Variable       | Value                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | `postgresql://plateguard_owner.<project-ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1` |
| `JWT_SECRET`   | a long random value                                                                                                                             |
| `NODE_ENV`     | `production`                                                                                                                                    |

Migrations run on deploy: `scripts/vercel-build.sh` applies pending migrations when
`MIGRATE_DATABASE_URL` is set, and runs the seed when `SEED_ON_DEPLOY=true` (it only fills an empty
demo location). Both are set for Production only, so a preview of a branch never changes the shared
database.

| Variable (Production only) | Value                                                                           |
| -------------------------- | ------------------------------------------------------------------------------- |
| `MIGRATE_DATABASE_URL`     | the session pooler: same user and password, port 5432, without `pgbouncer=true` |
| `SEED_ON_DEPLOY`           | `true`                                                                          |

To run migrations or the seed against the cloud database from your own machine, put the session
pooler address in `.env` and run `pnpm db:migrate` or `pnpm db:seed` as usual. Never run
`pnpm db:reset` against it.

A Supabase project on the free plan pauses after a week without use; unpause it in the Supabase
dashboard.

## The allergen engine

`packages/domain` judges one dish for one guest: `assess({ dish, guest })`. The same code runs in the app
for instant feedback and on the server for the decision that counts. It is fail-safe: missing or doubtful
data never gives "no allergen found".

- Severity is set per allergy, per guest: intolerance, allergy or severe. No choice means severe.
- Components are expanded recursively (jus contains stock). Shared equipment (fryer 1) adds its allergens
  as traces. Subtypes match their parent (a nut allergy is hit by hazelnut; a hazelnut allergy is hit by
  unspecified nuts, not by almond).
- One action per component, for all of the guest's allergies at once: fix inside a child, substitute, or
  omit. A substitute must be free of every allergen of the guest and verified; for severe it must be
  suitable for severe, and omitting alone is not enough. Premixed components can be neither omitted nor
  swapped. No single action means do not serve.
- Outcomes, worst counts: do not serve > unknown > caution > adaptable > none found (with note) > none found.
- Unverified ingredients and unmapped POS items are unknown, never overridable. An override exists only
  for intolerance.
- **Other allergies.** Besides the known allergens a waiter can add any number of other allergies, each
  with its own severity. Typing searches the restaurant's own ingredients, synonyms and other languages
  included ("tomaat" finds Tomato). A picked ingredient is judged against the recipes like an allergen:
  the engine finds it in every component, and fixes, swaps or omits it. For intolerance and allergy that
  is enough. For severe the cook also checks traces by hand (`manualChecks`), because recipes record
  traces per allergen, not per ingredient; the change on the plate still goes on the ticket. Text the waiter keeps as typed is
  not in the recipe data, so it is always unknown for that guest and listed under `manualChecks` for the
  cook to check by hand; ingredients whose name looks like the label are returned as hints. Changes
  required by known allergens stay on the ticket.
- Every assessment carries the engine version and a sha256 hash of its canonical input, for the audit trail.

There is a test for every cell of the decision table in `packages/domain/test/engine.test.ts`.

## Service: tables, seats, orders and alerts

The waiter's screens read and write through the API (`apps/api/src/modules/service`), under
`/api/locations/{locationId}/…`: floors with their tables, the menu as resolved recipe trees, a table's
seats with allergies and orders, and alerts.

- Recording an allergy opens the table's visit and the seat's guest on first use.
- Ordering a dish runs the engine and stores the plate with its assessment (append-only) and the
  changes for the ticket, in one transaction. Taking a dish off the order marks it cancelled.
- Alerts are not stored. They follow from the open orders and each seat's current allergies
  (`orderAlerts` in `packages/domain`), so the menu alone never raises one, and the Alerts tab, its
  badge and the table grid always agree.

## Admin: recipes, menu, floor plan and staff

`/admin` is the desktop environment. Each section shows only to roles that may use it; the API checks
the same permissions.

- **Recipes** (`menu.edit`): ingredients with their allergens and traces, components (nesting,
  substitutes, equipment, "can be left off", "mixed in"), and dishes. Only a role with
  `ingredient.verify` can mark an ingredient verified; changing its allergens needs a new check.
- **Menus**: which dishes are on the menu and in which order. Publishing (`menu.publish`) freezes the
  resolved recipes of every dish, in English and Dutch, as a new version. Service works from the
  latest published version only, so recipe edits reach the floor by publishing. Before publishing,
  unverified ingredients and empty components are listed. An order stores the version it was
  placed from, and its alerts keep judging that recipe.
- **Floor plan** (`floorplan.edit`): floors in the order waiters see them, hidden floors, and tables
  (number, seats, shape, POS number). Tables are never deleted: removing one makes it inactive, and
  a table with guests seated keeps its number and seats.
- **Staff** (`staff.manage`): people, their roles at this location and their PIN. A new PIN also
  unlocks a locked one. Only an owner makes someone an owner, and nobody changes their own roles.

## Signing in

Service devices are shared, so staff sign in per shift: pick your name, type your PIN (4 to 6
digits). A PIN belongs to one person on one location, is stored as a salted scrypt hash, and locks
after five wrong tries in a row until a manager sets a new one. The API answers with a session
token (HMAC-SHA256, signed with `JWT_SECRET`) that is bound to that location and lasts 12 hours.
A device learns its location once, from `?location=<slug>` or `VITE_LOCATION_SLUG`.

For scripts and local tools, `AUTH_MODE=dev` also accepts a user id in the `x-plateguard-user`
header. The API refuses to start with that mode in production.

## Tenants, locations and roles

An organization has locations. Roles (owner, manager, chef, cook, waiter, runner) are assigned to a
person on one location, or on the whole organization when the location is empty. Permissions are checked
with one function, `can(user, permission, location)`, in the API; the app uses it only to hide buttons.

The database enforces isolation on its own. The API runs every tenant query through `withTenant()`, which
switches to the restricted role `plateguard_app` and sets `app.org_id` and `app.location_ids`; row-level
security then refuses any row outside them, even if a query forgets its filter. The audit trail and
assessments are append-only: a trigger blocks updates and deletes, for the table owner too. See
`packages/db/test/rls.test.ts`.

## Languages

English is the source and the fallback, Dutch is complete. Texts never live in code, only keys such as
`t('tables:seat.allergyCount', { count })`, with ICU messages for plurals and variables. Allergen, dish and
component names are stored per locale in the database. API, webhooks and audit stay language neutral
(codes such as `GLUTEN`, `SEVERE`, `plate.checked.v1`).

To add a language, for example German: copy `packages/i18n/locales/en/` to `locales/de/` and translate it,
add `{ code: 'de', name: 'Deutsch' }` to `packages/i18n/src/config.ts`, run
`pnpm --filter @plateguard/i18n generate`, and add the German allergen names to
`packages/db/prisma/seed-data/allergens.ts`. `pnpm i18n:check` fails on missing or extra keys, invalid ICU,
mismatched variables, and keys that no code uses.

## Integrations

The core knows no POS brand. Everything from outside comes in through an adapter that translates to the
canonical format (`CanonicalOrder`, `CanonicalMenuItem`, `KitchenTicket`), and everything going out goes
through one outbox.

- Adapters implement ports (`PosAdapter`, `KdsAdapter`, `PrinterAdapter`) and report capabilities such as
  `order.allergens` or `kds.confirm`. The core asks "which adapter of this location can order.read?", never
  "is this Lightspeed?". Fallbacks (app entry instead of POS allergies, printer instead of KDS) follow from
  the capabilities.
- Inbound: `POST /hooks/{provider}/{connectionId}` verifies the request with the adapter, stores the raw
  message with an idempotency key, and answers right away. A worker processes the inbox later with
  `SKIP LOCKED`; a poller is the safety net for missed webhooks.
- Outbound: events are written to the outbox in the same transaction as the change. External webhooks are
  signed with HMAC-SHA256 in `PlateGuard-Signature` (with a timestamp against replay) and retried with
  growing waits for up to a day. Payloads never contain names or room numbers.

To add a provider: copy `apps/api/src/integrations/adapters/fake/`, implement the ports the system
supports, add recorded messages as fixtures, and register the adapter in `integrations.module.ts`.

## Design

House style v3: calm and modern, one clear blue (`#2f5bff`), soft surfaces, Geist with the system font as
fallback, large touch targets, and a dark kitchen display. Outcomes are red, amber, blue or neutral grey,
never green ("no allergen found in the recipe", not "safe"), and unknown is always hatched. Tokens live in
`packages/design-tokens/tokens.css`.

## Not in this skeleton yet

The PDF allergen card on publishing, drawing the floor plan, plate orders with the status machine, real-time updates (SSE), the inbox worker and
outbox dispatcher, real adapters, incidents and the dashboard. Each arrives in its phase of the plan.
