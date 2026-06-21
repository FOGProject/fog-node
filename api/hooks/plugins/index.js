/**
 * plugins hook
 *
 * @description :: Lightweight, Sails-1.x-native plugin loader for fog-node.
 *   Reads plugins.json (`enabled`) and loads each plugin from `plugins/<name>/`.
 *   A plugin module may contribute:
 *     - `routes`    : { 'VERB /path': (req, res) => {} }  bound after app routes
 *     - `menuItems` : [ ... ]  appended to the sidebar menu
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
    loaded = [];

  try {
    let cfg = JSON.parse(fs.readFileSync(path.join(appRoot, 'plugins.json'), 'utf8'));
    (cfg.enabled || []).forEach((name) => {
      let dir = path.join(appRoot, 'plugins', name);
      if (!fs.existsSync(dir)) { return; }
      let plugin = require(dir);
      if (plugin.routes) { Object.assign(routes, plugin.routes); }
      if (plugin.menuItems) { menuItems = menuItems.concat(plugin.menuItems); }
      loaded.push(plugin.name || name);
    });
  } catch (err) {
    // Surfaced in initialize() once the logger is available.
    routes.__error = err;
  }

  return {
    routes: { after: routes.__error ? {} : routes },
    initialize: async function () {
      if (routes.__error) {
        sails.log.error(`Plugins hook failed to load plugins.json: ${routes.__error}`);
        return;
      }
      if (menuItems.length && sails.config.globals && Array.isArray(sails.config.globals.menuItems)) {
        sails.config.globals.menuItems = sails.config.globals.menuItems.concat(menuItems);
      }
      sails.log.info(`Plugins loaded: ${loaded.length ? loaded.join(', ') : 'none'}`);
    }
  };
};
