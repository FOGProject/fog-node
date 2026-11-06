/**
 * The view locals that every list page (views/pages/list.ejs) needs beyond
 * its own columns (issue #150). One helper, so each list handler, core or
 * plugin, adds one line rather than a copy of this block.
 *
 *   section, page        the FOG 1.6 content header and tab title
 *                        ("All <plural>"), from page-title
 *   singular, plural     the nouns of the "Delete selected" dialog
 *   scrollMode,
 *   pageLength           from table-settings
 *   editBase             the list path, only when <base>/edit/:id is a known
 *                        GET route; the first column then links to the edit
 *                        page (as in 1.6). Absent otherwise.
 *
 * Usage: Object.assign(data, await sails.helpers.listLocals.with({identity: 'host', base: '/hosts'}))
 */
module.exports = {
  friendlyName: 'List locals',
  description: 'The title, nouns, table settings and edit link base of a list page.',
  inputs: {
    identity: {type: 'string', required: true, description: 'The model identity, for example "host".'},
    base: {type: 'string', required: true, description: 'The list path, for example "/hosts".'}
  },
  exits: {
    success: {outputType: 'ref', description: '{section, page, singular, plural, scrollMode, pageLength[, editBase]}'}
  },
  fn: async function ({identity, base}) {
    let names = sails.helpers.pageTitle.with({identity});
    let locals = {
      section: names.section,
      page: `All ${names.plural}`,
      singular: names.singular,
      plural: names.plural,
      ...await sails.helpers.tableSettings()
    };
    // No .now(): helpers run with execStyle 'natural', so .with() on a sync
    // helper returns the boolean itself (see is-known-get-path.js). The
    // strict check keeps a non-boolean from ever counting as true.
    if (sails.helpers.isKnownGetPath.with({path: `${base}/edit/:id`}) === true) {
      locals.editBase = base;
    }
    return locals;
  }
};
