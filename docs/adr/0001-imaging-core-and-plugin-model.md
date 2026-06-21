# 1. Imaging core + plugin model

- Status: **Accepted**
- Date: 2026-06-20

## Context

fog-node had drifted toward a monolith (Host carrying AD, kernel, printer,
snapin, group fields; Snapins/Printers built into the UI). The intent for FOG
2.0 is the opposite of 1.x: a small **imaging-focused core**, with management
features added as **plugins**, so admins compose only what they need.

## Decision

### The imaging core (the "crux")

Core is the imaging pipeline only:

- **Host** — a physical machine. Identified by a **hardware fingerprint, scored**
  (SMBIOS product UUID, serial, asset tag, board/chassis, MAC(s)), *not* by MAC
  as a single key. This is the FOG 1.6 issue **#198** concept (iPXE exposes
  SMBIOS natively; a server-side scorer matches at boot/checkin; registers a new
  host if no confident match). Base host attributes: identity (`name`,
  `description`), the fingerprint set, and the assigned **image**.
- **Image** — what gets deployed/captured.
- **Storage Node** — who hosts the image bytes (serve for deploy / receive for
  capture).
- **Storage Group** — groups storage nodes (placement/replication; node
  selection for forwarding).
- **Task / Workflow** — the imaging *job* (deploy X to host Y, capture from Z);
  what `/boot.ipxe` reads to decide deploy-vs-boot-local.
- **iPXE boot generation + forwarding** — generate the per-host iPXE script and
  forward/chain to the right next stage (FOS + kernel on a storage node that has
  the image).
- **Per-host secret/identity** (`pubKey`/`secToken`) — so FOS can authenticate
  for the HTTP image pull/push (see `docs/imaging.md`).

### Plugins

Management/extension features (WOL, Active Directory **host domain-join**,
printers, snapins, …) are plugins. Loader: `api/hooks/plugins/` reads
`plugins.json` and loads `plugins/<name>/` (see `docs/plugins.md`).

A plugin **owns its own collection + schema**, linked to the host by id — it does
**not** add fields to the core Host document. (Mongo would *allow* orphan fields
on the host doc, but per-plugin collections are cleaner: a plugin is truly
removable, owns its own validation/permissions, and leaves the host pristine.)

A plugin contributes UI to a core entity via an **event/hook bus** (same shape as
1.x's HookManager; fog-node uses `sails.emit/on`):

- `host:form` — core asks plugins to contribute tabs/fields for a host; each
  plugin returns UI populated from **its** collection.
- `host:save` — core saves the minimal host, then hands each plugin its
  namespaced slice (e.g. `ad[domain]`); the plugin writes to **its** collection.
- `host:destroy` — cascade: plugins delete their host-linked records.

`wol` is the route-only example; `ad`/`printers`/`snapins` are the
collection + host-link + hook examples.

### Active Directory

Two unrelated things, do not conflate:
- **Host domain-join** (`useAD`/`ADDomain`/…) — a *post-deploy* action; belongs
  to a **plugin** that adds those fields to the host via `host:form` + its own
  collection.
- **`fog-plugin-activedirectory`** — AD **authentication for logging into
  fog-node**; a separate auth plugin.

### Groups

**No Group entity in core.** 1.x groups are three things; we decompose them:
- **Mass tasking / mass config** → **bulk actions on the host list** (select
  hosts → schedule task / bulk-edit). No membership entity needed.
- **Organization / "group by name"** → **tags/labels on the host** (multi-valued;
  list filters + groups by tag).
- **There is no continuous inheritance to replicate.** In 1.x, joining/leaving a
  group does nothing to a host automatically; a group *update* (changing the
  group's image/AD/snapins) is an **explicit bulk push to the current members**.
  Tags (the persistent set) + bulk actions (the push) reproduce that fully — and
  tags add by-name visibility/filtering 1.x lacks. A persistent-groups-style
  "named static set with re-push" remains possible as a **plugin**, but isn't
  needed in core.

## Consequences

- Rework of current state: thin the Host to its core fingerprint+image; move AD,
  printers, snapins out to plugins; replace the Group model + `host.groups` with
  tags + bulk host-list actions.
- New core capabilities to build: the `host:form`/`host:save`/`host:destroy`
  extension points; host bulk actions; tags; the host-identity scorer.
- Plugins become truly modular: install/uninstall adds/removes a collection + its
  injected UI with no core residue.

## Resolved during discussion

- **Inherited group config is not a thing in 1.x** — join/leave does nothing
  automatically; a group update is an explicit bulk push to current members. So
  tags + bulk actions fully replace groups; no inheritance/"smart group" concept
  is needed in core.

## Built

- **Host extension points** (`host:form`/`host:save`/`host:destroy`) +
  `sails.plugins` dispatch; AD host-join extracted to `plugins/ad`. (PR #48)
- **Host fingerprint identity** (`helpers/identifyHost`): weighted scorer
  guid 100 / serial 50 / asset 30 / mac 40, threshold 40; wired into
  `boot.ipxe`. (PR #49)

## Open questions

- **Cross-collection list columns**: showing a plugin's value (e.g. "AD:
  joined") in the host list is a per-plugin list contribution + lookup, not a
  host field.
- **Disabled vs uninstalled plugin**: hide its data vs remove it.
- **Form save-dispatch convention**: namespacing plugin fields in the submitted
  host form so core routes each plugin its slice.
