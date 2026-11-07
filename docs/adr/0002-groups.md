# 2. Groups as a core record with plugin grants

- Status: **Accepted**
- Date: 2026-11-06

## Context

- ADR 0001 replaced Groups with host tags and host-list bulk actions.
- FOG 1.6 users know these sets as Groups. Tom wants the 1.6 look and behavior.
- The pinned 1.6 (fogproject ADR 0038) treats a group as a label plus live grants.

## Decision

- Group is a core record: `name`, `description` and `order`.
- Host membership is the `host.groups` array of group names. It was `host.tags`.
  Schema revision 2 (`migrations/2.js`) renames it.
- Names match without case. Saving a host with an unknown name creates the Group,
  when the user holds `group.create`.
- Permissions follow the 1.6 split:
  - A membership change is a group edit and needs `group.update`.
  - A new name also needs `group.create`.
  - Rename needs `group.update`, and delete needs `group.destroy`.
  - Neither needs `host.update`. fog-node stores membership on the host, but that
    is storage, not a host edit.
- A Group is a live holder of grants. A grant reaches every current member and
  every host that joins later. A host that leaves loses it. A direct host grant is
  never affected.
- The plugins own the grants, in their own collections keyed by group
  (`plugin_printer_group`, `plugin_snapin_group`). Core owns only membership and the
  sort order: `order`, then name, then id (`api/helpers/group/membership.js`).
- Plugins join through `extends.group` (`form`, `save`, `destroy`, `grants`,
  `resolve`). A disabled plugin leaves no tab and no grant.
- There is no group push action. As in the pinned 1.6 (ADR 0038 decision 10), the
  host list's bulk actions set image and other host fields.

## Consequences

- A host's effective printers and snapins come from `sails.plugins.groupResolve`. A
  future client or task path must call it, and not read the host links alone.
- The host page shows direct grants only, as in 1.6.

## Built

- The Group model, revision 2, the Group pages and "Edit groups" (ui16-11a).
- `extends.group` and the printer and snapin grants (ui16-11b).
