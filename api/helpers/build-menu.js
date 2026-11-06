/**
 * The sidebar menu tree for one request, built the way FOG 1.6 builds it
 * (issue #148; 1.6 FOGPage.php buildMainMenuItems and _renderMenuNode).
 *
 * Input items use the config/globals.js menuItems shape:
 *   leaf     {order, text, icon, link}
 *   section  {order, text, icon, link, plural?, subLinks: [{text, link}]}
 *   group    {order, text, icon, children: [leaf | section]}
 * A plugin item has the same shape, with or without `order`.
 *
 * It returns an array of nodes, each with `pluginOption`:
 *   - Items with a numeric `order` come first, sorted by it (MAIN NAVIGATION).
 *     So a plugin item with an order takes its 1.6 slot among the core items.
 *   - Items with no `order` come last, sorted by label without case, as 1.6
 *     natcasesorts its hook menu. They have `pluginOption: true`, and the
 *     sidebar renders them under PLUGIN OPTIONS.
 *
 * A section's first sub-link is "List All {plural}" (its own link). Every
 * other sub-link renders only when a GET route answers it (is-known-get-path),
 * so a planned page's link comes back by itself when its route lands. A
 * section left with only "List All" becomes a leaf, as in 1.6.
 *
 * Active state (1.6 rules):
 *   - A sub-link is active only when its path equals currentPath.
 *   - A section or leaf whose link has the same first segment as currentPath
 *     is active, and a section is also open (.menu-open).
 *   - A group is active and open when one of its children is active.
 *
 * Usage (views/layouts/layout.ejs):
 *   sails.helpers.buildMenu.with({items: sails.config.globals.menuItems, currentPath: req.path})
 * No .now(): Sails builds helpers with execStyle 'natural'
 * (node_modules/sails/lib/hooks/helpers/index.js), so .with() on a sync
 * helper returns the value itself. A template cannot await, so this helper
 * is sync.
 */
const firstSegment = (path) => path.split('/')[1];
const withoutQuery = (link) => link.split('?')[0];

// One leaf or section node. It never changes the config item: the builder
// runs on every request.
function buildEntry(item, currentPath) {
  const active = firstSegment(item.link) === firstSegment(currentPath);
  const subLinks = (item.subLinks || [])
    .filter((sub) => sails.helpers.isKnownGetPath.with({path: withoutQuery(sub.link)}))
    .map((sub) => ({text: sub.text, link: sub.link, active: withoutQuery(sub.link) === currentPath}));
  if (!subLinks.length) {
    return {type: 'leaf', text: item.text, icon: item.icon, link: item.link, active};
  }
  const listAll = {text: `List All ${item.plural || item.text}`, link: item.link, active: item.link === currentPath};
  return {type: 'section', text: item.text, icon: item.icon, active, open: active, subLinks: [listAll].concat(subLinks)};
}

function buildNode(item, currentPath) {
  if (!item.children) {
    return buildEntry(item, currentPath);
  }
  const children = item.children.map((child) => buildEntry(child, currentPath));
  const active = children.some((child) => child.active);
  return {type: 'group', text: item.text, icon: item.icon, active, open: active, children};
}

const hasOrder = (item) => typeof item.order === 'number';
// Natural, case-insensitive label order, as PHP natcasesort.
const byLabel = (a, b) => a.text.localeCompare(b.text, undefined, {numeric: true, sensitivity: 'base'});

module.exports = {
  friendlyName: 'Build menu',
  description: 'The sidebar menu tree, ordered and filtered, with the active and open flags for one path.',
  sync: true,
  inputs: {
    items: {type: 'ref', required: true, description: 'The menu items (sails.config.globals.menuItems).'},
    currentPath: {type: 'string', required: true, description: 'The request path, with no query string (req.path).'}
  },
  exits: {
    success: {outputType: 'ref', description: 'An array of menu nodes; see the comment at the top of this file.'}
  },
  // A sync machine must answer through exits.success. A plain return value
  // makes the call throw "not actually synchronous".
  fn: function ({items, currentPath}, exits) {
    const build = (list, pluginOption) => list.map((item) => Object.assign(buildNode(item, currentPath), {pluginOption}));
    // Array.prototype.sort is stable, so equal orders keep the config order.
    const main = build(items.filter(hasOrder).sort((a, b) => a.order - b.order), false);
    const plugins = build(items.filter((item) => !hasOrder(item)).sort(byLabel), true);
    return exits.success(main.concat(plugins));
  }
};
