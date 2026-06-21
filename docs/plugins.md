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
  menuItems: []
};
```

The shipped **`wol`** plugin (`plugins/wol/`) is the reference example: it adds
`POST /api/v1/host/:id/wol` to send a Wake-on-LAN magic packet to a host's MACs.

## Status / roadmap

- ✅ Loader + `wol` proof.
- Next: extension points so a plugin can also add a **model**, its own **pages**,
  and contribute to a **core entity's form** (e.g. a "Snapins" tab on the host
  edit page) — needed before extracting today's in-core Snapins/Printers/AD out
  into `fog-plugin-snapin` / `fog-plugin-print` / `fog-plugin-activedirectory`.
