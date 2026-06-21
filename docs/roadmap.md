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

- 10 core models: `Host`, `Image`, `PxeMenu`, `Role`, `Setting`, `StorageGroup`,
  `StorageNode`, `Task`, `User`, `Workflow`. (`Group` removed — ADR 0001; `Snapin`
  (#55/#56) and `Printer` (#57) extracted to plugins.)
- Generic CRUD driven by a `:model` route param (`api/controllers/general/*`),
  plus DataTables list/columns endpoints.
- Auth: passport local + JWT (cookiecombo) with a granular per-model permissions
  system (`config/permissions.js`, `Role`/`User` models).
- EJS pages for dashboard, list, create, login, hwinfo.
- Custom hooks: `fog-version`, `watchdog` (the seed of the future task runner).
- Interactive installer (`tools/setup/index.js`) and a non-interactive dev setup
  (`tools/setup/dev.js`).

**Gap vs. FOG 1.6 (still large).** Core entity *models* now largely exist (see
Phase 1); the remaining gaps are behavior, breadth, and views — not schema:

- Multicast, Pending Hosts / Pending MACs (host approval)
- Import/Export for every entity
- A real imaging engine (capture/deploy controllers are stubs)
- The 1.x background daemons (TaskScheduler, Image/Snapin replicators,
  MulticastManager, PingHosts, ImageSize, SnapinHash, FileDeleter)
- The hundreds of `FOG_*` global settings 1.x seeds
- Views: per-entity **list** views exist, but the per-entity **create forms**
  aren't built (`views/pages/partials/create/` is empty) and the list pages have
  no "Create new" entry point. (The `snapin` plugin is the exception — it ships
  its own create page.)

`tools/migrate/` is a Mongo *schema-revision* framework, **not** a 1.x-MySQL →
2.0 data importer; that importer does not exist yet.

## Decisions

1. **Client / FOS compatibility** — *decided: mirror 1.x fields now, settle the
   live protocol at Phase 2.* Entities are modelled on 1.x's schema (compatible-
   leaning); the actual capture/deploy/registration protocol is decided when
   imaging is built.
2. **Frontend direction** — *decided: server-rendered EJS + jQuery, on
   **AdminLTE 4 / Bootstrap 5*** (migrated from the AdminLTE 3 / BS4 templates).
   jQuery 3.7.1 is kept for DataTables / `fog.common.js` / parasails. Views are
   built per-entity on top of the API/model layer. Follow-ups: upgrade DataTables
   integration `-bs4` → `-bs5`, re-vendor Chart.js for AdminLTE 4 (dashboard
   charts), fix `systeminformation@5` property renames (hwinfo/dashboard load),
   and remove the unused Vue 3 / React 19 deps.

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

### Phase 1 — Data-model parity for core entities  *(in progress)*

Add the missing core entity models (mirroring 1.x fields). Each registered model
automatically gets full REST CRUD via the generic `:model` routes once it has a
`stock.<identity>` entry in `config/permissions.js`.

- [x] `StorageGroup` + `StorageNode` (with a bidirectional association) —
      mirrors 1.x `nfsGroups` / `nfsGroupMembers`.
- [x] `Snapin` — **extracted to the `snapin` plugin** (PRs #55/#56); no longer a
      core model. It contributes its own `snapin` model + permissions + list/create
      pages + the host "Snapins" tab (`extends.host`, links in the plugin's own
      `plugin_snapin_host` collection). (Sidebar still labels snapins "Modules" in
      places — reconcile later.)
- [x] `Printer` — **extracted to the `printer` plugin** (PR #57); no longer a core
      model. Contributes its own `printer` model + permissions + list/create pages
      + the host "Printers" tab (`extends.host`; host links + per-host
      `defaultPrinter`/level in `plugin_printer_host` / `plugin_printer_hostcfg`).
      Mirrors 1.x `printers`.
- [x] `PxeMenu` — mirrors 1.x `pxeMenuOptions` (the sidebar's "iPXE Menu"). The
      separate 1.x `ipxe` product/manufacturer/MAC → boot-file mapping table is
      deferred until the boot/imaging flow needs it.
- [x] `Host` + `Image` scalar field parity with 1.x (AD, kernel, product key,
      pending, security tokens, etc. on Host; path/type/partition/os/format/
      compress/etc. on Image). Existing fog-node fields/associations preserved.
      Image lookup FKs (`imageType`/`imagePartitionType`/`os`) kept as numeric
      ids for now.
- [x] Host↔Printer / Host↔Snapin assignments + per-host `defaultPrinter` — **now
      owned by the `printer`/`snapin` plugins** (links in each plugin's own
      `plugin_*_host` collections via `extends.host`), not core associations.
      `Group↔*` associations were removed with the Group entity (ADR 0001: groups
      → host `tags` + bulk list actions). Remaining core association:
      StorageGroup↔StorageNode (bidirectional). **Follow-up:** *assigning* core
      collection members through the API needs controller support — the generic
      `update` doesn't set collections and the blueprint nested
      `/:model/:id/:assoc/:fk` routes are shadowed by the custom `:model` routes
      (return 404). Add explicit add/remove endpoints (mirroring `role/assign`).
- [ ] `Task` field parity (gated partly by the client/FOS decision).
- [ ] Lookup models to replace numeric FKs: ImageType, PartitionType, OS.
- [ ] Seed the `FOG_*` settings 1.x expects.
- [ ] Page controllers/views for the new entities (EJS + jQuery, per the frontend
      decision); reconcile the sidebar (`config/globals.js`) labels/routes with the
      model identities (e.g. "Modules" → snapin, plural view routes).
- [ ] Remove the unused Vue 3 / React 19 dependencies (frontend decision).

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
