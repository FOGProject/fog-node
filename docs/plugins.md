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
  // auth yourself (e.g. `if (!req.user) return res.forbidden();`).
  routes: {
    'POST /api/v1/host/:id/wol': async function (req, res) { /* … */ }
  },
  // Optional: appended to the sidebar menu (config/globals.js menuItems shape).
  menuItems: [],

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

  // Optional: extend a core entity's form/data without touching the core model.
  // form(record) -> extra formItems (from the plugin's own collection);
  // save(hostId, params) -> persist the plugin's slice; destroy(hostId) -> cascade.
  extends: {
    host: { form: async (record) => ({}), save: async (id, p) => {}, destroy: async (id) => {} }
  }
};
```

The shipped **`wol`** plugin (`plugins/wol/`) is the route-only reference; **`ad`**
(`plugins/ad/`) is the `extends.host` reference (its own `plugin_ad` collection +
an injected "Active Directory" tab).

## Status / roadmap

- ✅ Loader + `wol` proof.
- ✅ `extends.host` form/save/destroy extension points (AD plugin).
- ✅ Plugins contribute **models** + **permissions** → full generic CRUD.
- Next: extract today's in-core Snapins/Printers into `fog-plugin-snapin` /
  `fog-plugin-print` using `models` (catalog CRUD) + `extends.host` (assignment).
