# fog-node roadmap

fog-node is **"FOG 2.0"** — a from-scratch [Sails.js](https://sailsjs.com)
(Node.js) rewrite of the FOG Project server, backed by MongoDB. It is **not** a
port of the PHP FOG 1.x codebase: it re-architects the domain (e.g. a
`Workflow` abstraction with no 1.x equivalent, generic `:model` CRUD, Sails
associations in place of 1.x's explicit association tables, "Module" as the
snapin analog). "Catching up to 1.6" therefore means *reimplementation*, never a
code merge.

This document tracks where the rewrite stands and the plan toward feature parity
with FOG 1.6.

## Current state

**Runtime works.** With MongoDB available and setup run, the app lifts cleanly on
both Node 22 and Node 26 (`Server lifted`, port 1337). The status API, local +
JWT auth, and the seeded Administrator account are functional.

**Implemented today:**

- 8 models: `Host`, `Image`, `Group`, `Role`, `Setting`, `Task`, `User`,
  `Workflow`.
- Generic CRUD driven by a `:model` route param (`api/controllers/general/*`),
  plus DataTables list/columns endpoints.
- Auth: passport local + JWT (cookiecombo) with a granular per-model permissions
  system (`config/permissions.js`, `Role`/`User` models).
- EJS pages for dashboard, list, create, login, hwinfo.
- Custom hooks: `fog-version`, `watchdog` (the seed of the future task runner).
- Interactive installer (`tools/setup/index.js`) and a non-interactive dev setup
  (`tools/setup/dev.js`).

**Gap vs. FOG 1.6 (large).** The sidebar (`config/globals.js`) advertises much
more than exists. None of the following have models/controllers/views yet:

- Storage Groups, Storage Nodes (core to imaging & replication)
- Modules/Snapins, Printers, iPXE menus
- Multicast, Pending Hosts / Pending MACs (host approval)
- Import/Export for every entity
- A real imaging engine (capture/deploy controllers are stubs)
- The 1.x background daemons (TaskScheduler, Image/Snapin replicators,
  MulticastManager, PingHosts, ImageSize, SnapinHash, FileDeleter)
- The hundreds of `FOG_*` global settings 1.x seeds

`tools/migrate/` is a Mongo *schema-revision* framework, **not** a 1.x-MySQL →
2.0 data importer; that importer does not exist yet.

## Open decisions (gate detailed planning of Phases 2+)

1. **Client / FOS compatibility** — must fog-node speak the *existing*
   fog-client and FOS (iPXE/imaging) APIs so current clients keep working, or are
   the client/FOS being rewritten alongside 2.0? This shapes the entire imaging
   and host-registration surface.
2. **Frontend direction** — `package.json` currently carries Vue 3 *and* React 19
   *and* jQuery 4 *and* parasails *and* DataTables; the EJS layout references some
   vendored files that aren't installed. One stack needs to be chosen.

## Phases

### Phase 0 — Make "run" reliable & reproducible  *(in progress)*

- [x] Fix the `watchdog` hook crash (`async.forever` given an async iteratee —
      broke under `async@3`).
- [x] One-command dev MongoDB (`docker-compose.yml`).
- [x] Non-interactive dev setup (`npm run setup:dev`).
- [x] Document supported Node versions + dev quickstart (README).
- [ ] Make `npm run lint` runnable again — installed `eslint@10` only supports
      flat config, but the repo ships a v4-style `.eslintrc`. Either migrate to
      `eslint.config.js` (and clean up the resulting warnings, since the lint
      script runs with `--max-warnings=0`) or pin `eslint` to v8. Deferred —
      decide the eslint direction first.
- [ ] Resolve the lockfile split (`yarn.lock` is committed while
      `package-lock.json` keeps reappearing untracked). Pick one tool.

### Phase 1 — Data-model parity for core entities  *(foundation)*

Add missing models + fields and wire them into routes / CRUD / views:
StorageGroup, StorageNode, Module (Snapin), iPXE menu, Printer. Flesh out
`Host`/`Image`/`Task`/`Setting` to carry 1.x's fields. Seed the `FOG_*` settings
1.x expects.

### Phase 2 — Imaging end-to-end  *(the heart of FOG)*

Storage-node integration, real capture/deploy (image-lock helpers already exist),
iPXE menu generation, host registration from FOS, progress over sockets via
`Task`/`Workflow`.

### Phase 3 — Background services

Port the 1.x daemons as Sails hooks/services (the `watchdog` hook is the seed):
task scheduler, image/snapin replication, multicast manager, ping hosts, image
size, snapin hash, file deleter.

### Phase 4+ — Breadth

Snapins/modules, printers, WOL, power management, inventory, reports,
import/export, Active Directory, plugins — then auth/settings-UI/i18n polish and
a 1.x → 2.0 data migration path.
