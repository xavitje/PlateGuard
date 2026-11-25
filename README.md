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
pnpm db:seed                    # EU-14 allergens in English and Dutch, plus a demo location
pnpm dev:web                    # http://localhost:5173
pnpm dev:api                    # http://localhost:3000/api/health
```

Checks, as CI runs them: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm i18n:check`, `pnpm test`
(the database tests run when `DATABASE_URL` is set) and `pnpm build`.

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
  the engine finds it in every component, and fixes, swaps or omits it. Text the waiter keeps as typed is
  not in the recipe data, so it is always unknown for that guest and listed under `manualChecks` for the
  cook to check by hand; ingredients whose name looks like the label are returned as hints. Changes
  required by known allergens stay on the ticket.
- Every assessment carries the engine version and a sha256 hash of its canonical input, for the audit trail.

There is a test for every cell of the decision table in `packages/domain/test/engine.test.ts`.

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

Authentication (JWT, PIN per person), the recipe and menu editors, publishing with the PDF allergen card,
the floor plan editor, plate orders with the status machine, real-time updates (SSE), the inbox worker and
outbox dispatcher, real adapters, incidents and the dashboard. Each arrives in its phase of the plan.
