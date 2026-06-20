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

## Decisions

1. **Client / FOS compatibility** — *decided: mirror 1.x fields now, settle the
   live protocol at Phase 2.* Entities are modelled on 1.x's schema (compatible-
   leaning); the actual capture/deploy/registration protocol is decided when
   imaging is built.
2. **Frontend direction** — *decided: server-rendered EJS + jQuery / DataTables /
   AdminLTE* (matches 1.x, no build step, what the existing pages use). The
   half-present Vue 3 / React 19 deps should be removed (follow-up). Views are
   built per-entity on top of the API/model layer.

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
- [x] `Snapin` — mirrors 1.x `snapins`. (The sidebar labels these "Modules"; the
      model is named `Snapin` to match 1.x domain language and avoid shadowing
      Node's `Module` global. Sidebar label/route to be reconciled later.)
- [x] `Printer` — mirrors 1.x `printers`. NOTE: the 1.x `pModel` field is exposed
      as `printerModel`, not `model`, because the generic route param `:model`
      would otherwise clobber a body field named `model`.
- [x] `PxeMenu` — mirrors 1.x `pxeMenuOptions` (the sidebar's "iPXE Menu"). The
      separate 1.x `ipxe` product/manufacturer/MAC → boot-file mapping table is
      deferred until the boot/imaging flow needs it.
- [x] `Host` + `Image` scalar field parity with 1.x (AD, kernel, product key,
      pending, security tokens, etc. on Host; path/type/partition/os/format/
      compress/etc. on Image). Existing fog-node fields/associations preserved.
      Image lookup FKs (`imageType`/`imagePartitionType`/`os`) kept as numeric
      ids for now.
- [ ] Host↔Snapin / Host↔Printer / Group associations (1.x association tables);
      Host "default printer" (1.x `printerAssoc.isDefault`).
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
