# fog-node plugins

fog-node's **core is the imaging pipeline** (hosts, images, storage, tasks,
PXE/boot). Management features that *extend* a host beyond imaging — WOL,
printers, snapins, Active Directory, DHCP/TFTP, etc. — are **plugins**, so admins
enable only what they need instead of one monolith.

## How loading works

- `plugins.json` lists `enabled` / `disabled` plugin names.
- The `plugins` hook (`api/hooks/plugins/`) loads each enabled plugin from
  `plugins/<name>/` at lift and logs `Plugins loaded: …`.
- (This is the Sails-1.x-native replacement for fog-too's PluginService +
  `sails-util-mvcsloader`. Plugins can later be packaged as their own repos /
  npm modules; the contract below stays the same.)

## Plugin contract

`plugins/<name>/index.js` exports:

```js
module.exports = {
  name: 'wol',
  // Routes bound after the app routes. Handlers are (req, res) functions.
  // NOTE: a route whose value is a function gets the `'*'` chain of
  // config/policies.js first, as a core page does. Check the
  // permission yourself (e.g. `if (!can(req, 'read')) return res.forbidden();`).
  routes: {
    'POST /api/v1/host/:id/wol': async function (req, res) { /* … */ }
  },
  // Optional: added to the sidebar menu (config/globals.js menuItems shape).
  // See "Sidebar menu items" below for `order` and PLUGIN OPTIONS.
  menuItems: [
    { order: 50, text: 'Snapins', link: '/snapins', icon: 'fas fa-cube',
      subLinks: [{ link: '/snapins/create', text: 'Create New Snapin' }] }
  ],

  // Optional: contribute full Waterline MODELS. Merged into the ORM
  // (sails.config.orm.moduleDefinitions.models) before Waterline initializes, so
  // the entity gets the entire generic CRUD for free: /api/v1/<identity>,
  // datatables, the generic edit page, global search, associations. Keyed by
  // identity; config/models.js defaults (datastore, id, timestamps) are applied.
  models: {
    snapin: { identity: 'snapin', globalId: 'Snapin', attributes: { /* … */ } }
  },

  // Optional: contribute permissions for those entities. Merged into
  // sails.config.permissions.stock; admin roles auto-receive them, non-admin
  // roles can be granted them. Without this the CRUD policies 403.
  permissions: {
    snapin: { create: false, read: false, update: false, destroy: false }
  },

  // Optional: add the entity to global search (only while the plugin is enabled,
  // so disabling it can't break search). model/label/fields.
  search: [
    { model: 'snapin', label: 'Snapins', fields: ['name', 'description', 'file'] }
  ],

  // Optional: extend a core entity's form/data without touching the core model.
  // form(record) -> extra formItems (from the plugin's own collection);
  // save(hostId, params) -> persist the plugin's slice; destroy(hostId) -> cascade.
  extends: {
    host: { form: async (record) => ({}), save: async (id, p) => {}, destroy: async (id) => {} },

    // Optional: group grants, as FOG 1.6 (its ADR 0038). A Group grants a
    // thing to every current member and every host that joins later; a host
    // that leaves loses it; a grant given directly to a host is never
    // affected. The plugin keeps the grants in its own collection keyed by
    // group. Core knows only membership and order
    // (api/helpers/group/membership.js). Each function is optional.
    group: {
      // formItems for the group edit page, each with its own `tab`.
      form: async (group) => ({}),
      // Persist the plugin's own keys of a group save (POST /groups/edit/:id,
      // which needs group.update). Do nothing when the keys are absent.
      save: async (groupId, params) => {},
      // Remove the grant rows of a deleted group.
      destroy: async (groupId) => {},
      // The Grants column of /groups: {[groupId]: ['2 snapins']}.
      grants: async (groupIds) => ({}),
      // The effective set of each host: {[hostId]: <set>}. `membership` is
      // {[hostId]: [<Group records>]}, each list in the 1.6 order: `order`,
      // then name without case, then id.
      resolve: async (hostIds, membership) => ({})
    }
  }
};
```

`sails.plugins` dispatches these to the enabled plugins, in `plugins.json`
order: `groupForm(group)`, `groupSave(groupId, params)`,
`groupDestroy(groupId)`, `groupGrants(groupIds)` (the labels in plugin order,
so snapins come before printers), and `groupResolve(hostIds)`, which returns
`{[hostId]: {[pluginName]: <set>}}`. A disabled plugin has no group tab, writes
nothing on a group save, has no Grants label and no `groupResolve` key. Its rows
stay in its own collection. The `snapin` and `printer` plugins are the
references.

## Sidebar menu items

`api/helpers/build-menu.js` builds the sidebar from the core items in
`config/globals.js` and the `menuItems` of each enabled plugin. It places a
plugin item by its `order` field, as FOG 1.6 does:

- **With `order`:** the item sits in MAIN NAVIGATION, sorted among the core
  items by `order`. Snapins (`order: 50`) and Printers (`order: 90`) use this,
  because they are core pages in 1.6. The core orders are in
  `config/globals.js`.
- **With no `order`:** the item sits under a second header, PLUGIN OPTIONS,
  sorted by label without case. A minus link on that header collapses the
  plugin list. With no such item, the header does not render.

A sub-link renders only while a GET route answers its path
(`api/helpers/is-known-get-path.js`). So list a sub-link only for a page your
plugin routes, or one that is planned: it appears when its route lands. A
section left with only its "List All" link renders as a single link.

The shipped **`wol`** plugin (`plugins/wol/`) is the route-only reference; **`ad`**
(`plugins/ad/`) is the `extends.host` reference (its own `plugin_ad` collection +
an injected "Active Directory" tab).

## Status / roadmap

- ✅ Loader + `wol` proof.
- ✅ `extends.host` form/save/destroy extension points (AD plugin).
- ✅ Plugins contribute **models** + **permissions** → full generic CRUD.
- ✅ `extends.group` group grants: the `snapin` and `printer` plugins grant through a Group, as FOG 1.6.
- Next: extract today's in-core Snapins/Printers into `fog-plugin-snapin` /
  `fog-plugin-print` using `models` (catalog CRUD) + `extends.host` (assignment).
