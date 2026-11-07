/**
 * plugins hook
 *
 * @description :: Lightweight, Sails-1.x-native plugin loader for fog-node.
 *   Reads plugins.json (`enabled`) and loads each plugin from `plugins/<name>/`.
 *   A plugin module may contribute:
 *     - `routes`    : { 'VERB /path': (req, res) => {} }  bound after app routes
 *     - `menuItems` : [ ... ]  appended to the sidebar menu (an `order` places
 *                     an item in MAIN NAVIGATION; with none it goes under
 *                     PLUGIN OPTIONS; see api/helpers/build-menu.js)
 *     - `extends.host` : { form(record), save(hostId, params), destroy(hostId) }
 *         form    -> returns extra formItems for the host create/edit form,
 *                    populated from the plugin's OWN collection (never the host).
 *         save    -> persists the plugin's namespaced fields (e.g. params.ad)
 *                    to the plugin's collection, keyed by host id.
 *         destroy -> removes the plugin's host-linked record (cascade).
 *     - `extends.group` : { form(group), save(groupId, params), destroy(groupId),
 *                           grants(groupIds), resolve(hostIds, membership) }
 *         The plugin's group grants (FOG 1.6 ADR 0038), in its own collection
 *         keyed by group. Each function is optional; docs/plugins.md has the
 *         contract. Core knows only membership and order (group/membership).
 *   This is the modern replacement for fog-too's PluginService + the old
 *   sails-util-mvcsloader (which targeted Sails 0.12). Imaging stays in core;
 *   management features (wol, printers, snapins, AD, ...) live as plugins.
 *
 * @docs :: https://sailsjs.com/docs/concepts/extending-sails/hooks
 */
const path = require('path');
const fs = require('fs');
const loadPreferences = require('../../policies/loadPreferences');

// A plugin route whose value is a function binds as plain middleware, so no
// policy runs on it. Run loadPreferences (read-only, never denies) first, so
// the layout gets the user's theme on /snapins, /printers and the rest. A
// route whose value is an {action: ...} target already gets the policies.
// The wrapper is async on purpose: Sails sends a rejected promise to next()
// (a 500) only when the bound handler is an AsyncFunction
// (sails/lib/router/bind.js). A plain wrapper would leave the rejection of an
// async route unhandled, and that stops the server.
const withPreferences = (fn) => async (req, res, next) => loadPreferences(req, res, () => fn(req, res, next));

// The GET paths of route keys: 'GET /hosts/edit/:id' -> '/hosts/edit/:id'.
// A key with no verb ('/hwinfo') answers GET too. Any other verb, and a key
// that is not a path (a regex route), is skipped.
const getPaths = (keys) => keys
  .map((key) => /^\s*(?:([a-z]+)\s+)?(\/\S*)\s*$/i.exec(key))
  .filter((m) => m && (!m[1] || m[1].toUpperCase() === 'GET'))
  .map((m) => m[2]);

// What the named plugins contribute, in the order of `names` (plugins.json
// `enabled`): their routes, menu items, models, permissions, search entries,
// host extensions and group extensions, and the names loaded. A name with no
// plugins/<name>/ directory is skipped. Exported as module.exports.collect,
// so a test can collect a list of its own.
function collect(appRoot, names) {
  let out = {
    routes: {}, menuItems: [], models: {}, permissions: {}, search: [],
    hostExtensions: [], groupExtensions: [], loaded: []
  };
  names.forEach((name) => {
    let dir = path.join(appRoot, 'plugins', name);
    if (!fs.existsSync(dir)) { return; }
    let plugin = require(dir);
    if (plugin.routes) {
      Object.keys(plugin.routes).forEach((route) => {
        let target = plugin.routes[route];
        out.routes[route] = typeof target === 'function' ? withPreferences(target) : target;
      });
    }
    if (plugin.menuItems) { out.menuItems = out.menuItems.concat(plugin.menuItems); }
    if (plugin.models) { Object.assign(out.models, plugin.models); }
    if (plugin.permissions) { Object.assign(out.permissions, plugin.permissions); }
    if (plugin.search) { out.search = out.search.concat(plugin.search); }
    if (plugin.extends && plugin.extends.host) {
      out.hostExtensions.push(Object.assign({ name: plugin.name || name }, plugin.extends.host));
    }
    if (plugin.extends && plugin.extends.group) {
      out.groupExtensions.push(Object.assign({ name: plugin.name || name }, plugin.extends.group));
    }
    out.loaded.push(plugin.name || name);
  });
  return out;
}

module.exports = function definePluginsHook(sails) {
  let appRoot = path.join(__dirname, '..', '..', '..');
  let routes = {};
  let menuItems = [];
  let hostExtensions = [];
  let groupExtensions = [];
  let models = {};
  let permissions = {};
  let search = [];
  let loaded = [];
  let loadError = null;

  try {
    let cfg = JSON.parse(fs.readFileSync(path.join(appRoot, 'plugins.json'), 'utf8'));
    ({ routes, menuItems, models, permissions, search, hostExtensions, groupExtensions, loaded } =
      collect(appRoot, cfg.enabled || []));
  } catch (err) {
    loadError = err;
  }

  return {
    routes: { after: loadError ? {} : routes },
    // Contribute plugin Waterline models into the ORM (merged after api/models,
    // before Waterline initializes) so plugin entities get the full generic CRUD.
    configure: function () {
      if (loadError) { return; }
      if (Object.keys(models).length) {
        sails.config.orm = sails.config.orm || {};
        sails.config.orm.moduleDefinitions = sails.config.orm.moduleDefinitions || {};
        sails.config.orm.moduleDefinitions.models = Object.assign(
          sails.config.orm.moduleDefinitions.models || {},
          models
        );
      }
      // Contribute plugin entity permissions so roles can be granted them
      // (admin roles auto-receive every config permission).
      if (Object.keys(permissions).length) {
        sails.config.permissions = sails.config.permissions || {};
        sails.config.permissions.stock = Object.assign(
          sails.config.permissions.stock || {},
          permissions
        );
      }
    },
    initialize: async function () {
      if (loadError) {
        sails.log.error(`Plugins hook failed to load plugins.json: ${loadError}`);
      } else if (menuItems.length && sails.config.globals && Array.isArray(sails.config.globals.menuItems)) {
        // Unsorted on purpose: api/helpers/build-menu.js sorts by `order`
        // at render, so the order rule lives in one place.
        sails.config.globals.menuItems = sails.config.globals.menuItems.concat(menuItems);
      }

      // Every GET path the app and the enabled plugins route. The sidebar
      // (api/helpers/is-known-get-path.js) hides a link that none answers.
      sails.config.globals.knownGetPaths = new Set(getPaths(
        Object.keys(sails.config.routes || {}).concat(loadError ? [] : Object.keys(routes))
      ));

      // Expose plugin extension dispatch to core controllers.
      sails.plugins = {
        loaded: loadError ? [] : loaded,
        hostExtensions: loadError ? [] : hostExtensions,
        // Search entities contributed by plugins (model/label/fields), appended
        // to core global search only while the plugin is enabled.
        search: loadError ? [] : search,
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
        },
        // The group grants of the enabled plugins, in plugins.json order. The
        // group functions below read sails.plugins.groupExtensions at call
        // time, not this list, so a test can take a plugin out.
        groupExtensions: loadError ? [] : groupExtensions,
        // Merge every plugin's group edit tabs into one formItems object.
        groupForm: async function (group) {
          let out = {};
          for (let ext of sails.plugins.groupExtensions) {
            if (ext.form) { Object.assign(out, (await ext.form(group)) || {}); }
          }
          return out;
        },
        // Let each plugin persist its own keys of a group save.
        groupSave: async function (groupId, params) {
          for (let ext of sails.plugins.groupExtensions) {
            if (ext.save) { await ext.save(groupId, params); }
          }
        },
        // Cascade: let each plugin remove the grant rows of a deleted group.
        groupDestroy: async function (groupId) {
          for (let ext of sails.plugins.groupExtensions) {
            if (ext.destroy) { await ext.destroy(groupId); }
          }
        },
        // The Grants column: {[groupId]: [label, ...]}, one key for each id.
        // The labels follow the plugin load order, so snapins come before
        // printers, as 1.6 (Route.php ~8820-8830).
        groupGrants: async function (groupIds) {
          let out = {};
          groupIds.forEach((id) => { out[String(id)] = []; });
          for (let ext of sails.plugins.groupExtensions) {
            if (!ext.grants) { continue; }
            let labels = (await ext.grants(groupIds)) || {};
            Object.keys(out).forEach((id) => { out[id] = out[id].concat(labels[id] || []); });
          }
          return out;
        },
        // What each host gets, direct plus group-granted:
        // {[hostId]: {[pluginName]: <the plugin's effective set>}}. One
        // group/membership read for every plugin, so each resolves from the
        // same Groups in the same order.
        groupResolve: async function (hostIds) {
          let membership = await sails.helpers.group.membership.with({hostIds});
          let out = {};
          Object.keys(membership).forEach((id) => { out[id] = {}; });
          for (let ext of sails.plugins.groupExtensions) {
            if (!ext.resolve) { continue; }
            let sets = (await ext.resolve(Object.keys(membership), membership)) || {};
            Object.keys(out).forEach((id) => { out[id][ext.name] = sets[id]; });
          }
          return out;
        }
      };

      sails.log.info(`Plugins loaded: ${loaded.length ? loaded.join(', ') : 'none'}`);
    }
  };
};

module.exports.collect = collect;
