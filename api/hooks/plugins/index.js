/**
 * plugins hook
 *
 * @description :: Lightweight, Sails-1.x-native plugin loader for fog-node.
 *   Reads plugins.json (`enabled`) and loads each plugin from `plugins/<name>/`.
 *   A plugin module may contribute:
 *     - `routes`    : { 'VERB /path': (req, res) => {} }  bound after app routes
 *     - `menuItems` : [ ... ]  appended to the sidebar menu
 *     - `extends.host` : { form(record), save(hostId, params), destroy(hostId) }
 *         form    -> returns extra formItems for the host create/edit form,
 *                    populated from the plugin's OWN collection (never the host).
 *         save    -> persists the plugin's namespaced fields (e.g. params.ad)
 *                    to the plugin's collection, keyed by host id.
 *         destroy -> removes the plugin's host-linked record (cascade).
 *   This is the modern replacement for fog-too's PluginService + the old
 *   sails-util-mvcsloader (which targeted Sails 0.12). Imaging stays in core;
 *   management features (wol, printers, snapins, AD, ...) live as plugins.
 *
 * @docs :: https://sailsjs.com/docs/concepts/extending-sails/hooks
 */
const path = require('path'),
  fs = require('fs');

module.exports = function definePluginsHook(sails) {
  let appRoot = path.join(__dirname, '..', '..', '..'),
    routes = {},
    menuItems = [],
    hostExtensions = [],
    loaded = [],
    loadError = null;

  try {
    let cfg = JSON.parse(fs.readFileSync(path.join(appRoot, 'plugins.json'), 'utf8'));
    (cfg.enabled || []).forEach((name) => {
      let dir = path.join(appRoot, 'plugins', name);
      if (!fs.existsSync(dir)) { return; }
      let plugin = require(dir);
      if (plugin.routes) { Object.assign(routes, plugin.routes); }
      if (plugin.menuItems) { menuItems = menuItems.concat(plugin.menuItems); }
      if (plugin.extends && plugin.extends.host) {
        hostExtensions.push(Object.assign({ name: plugin.name || name }, plugin.extends.host));
      }
      loaded.push(plugin.name || name);
    });
  } catch (err) {
    loadError = err;
  }

  return {
    routes: { after: loadError ? {} : routes },
    initialize: async function () {
      if (loadError) {
        sails.log.error(`Plugins hook failed to load plugins.json: ${loadError}`);
      } else if (menuItems.length && sails.config.globals && Array.isArray(sails.config.globals.menuItems)) {
        sails.config.globals.menuItems = sails.config.globals.menuItems.concat(menuItems);
      }

      // Expose plugin extension dispatch to core controllers.
      sails.plugins = {
        loaded: loadError ? [] : loaded,
        hostExtensions: loadError ? [] : hostExtensions,
        // Merge every plugin's host form contributions into one formItems object.
        hostForm: async function (record) {
          let out = {};
          for (let ext of hostExtensions) {
            if (ext.form) { Object.assign(out, (await ext.form(record)) || {}); }
          }
          return out;
        },
        // Let each plugin persist its slice of a host save.
        hostSave: async function (hostId, params) {
          for (let ext of hostExtensions) {
            if (ext.save) { await ext.save(hostId, params); }
          }
        },
        // Cascade: let each plugin remove its host-linked record.
        hostDestroy: async function (hostId) {
          for (let ext of hostExtensions) {
            if (ext.destroy) { await ext.destroy(hostId); }
          }
        }
      };

      sails.log.info(`Plugins loaded: ${loaded.length ? loaded.join(', ') : 'none'}`);
    }
  };
};
