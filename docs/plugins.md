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
  // NOTE: plugin routes are not covered by the core action policies — guard
  // auth yourself (e.g. `if (!req.user) return res.forbidden();`). The loader
  // runs only the read-only loadPreferences policy first, so a page that
  // renders the layout gets the user's theme.
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
    host: { form: async (record) => ({}), save: async (id, p) => {}, destroy: async (id) => {} }
  }
};
```

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
- Next: extract today's in-core Snapins/Printers into `fog-plugin-snapin` /
  `fog-plugin-print` using `models` (catalog CRUD) + `extends.host` (assignment).
