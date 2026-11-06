/**
 * The names a page uses for a model: the singular and plural nouns, and the
 * section title of its content header (views/layouts/partials/content-header.ejs).
 *
 * `section` is the FOG 1.6 page name (src/Pages/*Management.php, for example
 * HostManagement.php:105). "Workflow Management" is fog-node only. One static
 * map, so every list, create and edit page reads the same words.
 *
 * Usage: sails.helpers.pageTitle.with({identity: 'host'})
 *   -> {singular: 'Host', plural: 'Hosts', section: 'Host Management'}
 * An unknown identity returns undefined.
 *
 * No .now(): Sails builds helpers with execStyle 'natural'
 * (node_modules/sails/lib/hooks/helpers/index.js), so .with() on a sync
 * helper returns the value itself, and the value has no .now().
 */
const TITLES = {
  host:         {singular: 'Host',          plural: 'Hosts',          section: 'Host Management'},
  image:        {singular: 'Image',         plural: 'Images',         section: 'Image Management'},
  storagegroup: {singular: 'Storage Group', plural: 'Storage Groups', section: 'Storage Group Management'},
  storagenode:  {singular: 'Storage Node',  plural: 'Storage Nodes',  section: 'Storage Node Management'},
  pxemenu:      {singular: 'iPXE Menu',     plural: 'iPXE Menus',     section: 'iPXE Management'},
  user:         {singular: 'User',          plural: 'Users',          section: 'User Management'},
  role:         {singular: 'Role',          plural: 'Roles',          section: 'Role Management'},
  task:         {singular: 'Task',          plural: 'Tasks',          section: 'Task Management'},
  workflow:     {singular: 'Workflow',      plural: 'Workflows',      section: 'Workflow Management'},
  snapin:       {singular: 'Snapin',        plural: 'Snapins',        section: 'Snapin Management'},
  printer:      {singular: 'Printer',       plural: 'Printers',       section: 'Printer Management'}
};
// Frozen, so a caller cannot change the words for every later page.
Object.values(TITLES).forEach(Object.freeze);

module.exports = {
  friendlyName: 'Page title',
  description: 'The singular, plural and 1.6 section title of a model identity.',
  sync: true,
  inputs: {
    identity: {type: 'string', required: true, description: 'The model identity, for example "host".'}
  },
  exits: {
    success: {outputType: 'ref', description: '{singular, plural, section}, or undefined for an unknown identity.'}
  },
  // A sync machine must answer through exits.success. A plain return value
  // makes the call throw "not actually synchronous".
  fn: function ({identity}, exits) {
    // hasOwnProperty: an identity such as "constructor" is unknown, not a
    // property of Object.prototype.
    return exits.success(Object.prototype.hasOwnProperty.call(TITLES, identity) ? TITLES[identity] : undefined);
  }
};
