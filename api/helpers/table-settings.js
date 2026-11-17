/**
 * The list page table settings (issue #150), read through the settings
 * catalog (config/fog-settings.js) with sails.helpers.settings.get:
 *
 *   FOG_TABLE_SCROLL_MODE   'infinite' or 'paged' (any case). Default 'infinite'.
 *   FOG_VIEW_DEFAULT_SCREEN A positive whole number of rows per page, or -1
 *                           for all rows. A numeric string such as '50' counts.
 *                           Default 25.
 *
 * The catalog entries hold the defaults and the validation. A missing record
 * or a bad value falls back to its default. The helper only reads: it never
 * creates a record, so an install with no record keeps the defaults.
 *
 * Usage: await sails.helpers.tableSettings()
 *   -> {scrollMode: 'infinite', pageLength: 25}
 */
module.exports = {
  friendlyName: 'Table settings',
  description: 'The list page scroll mode and page length, from the Setting records.',
  inputs: {},
  exits: {
    success: {outputType: 'ref', description: '{scrollMode, pageLength}'}
  },
  fn: async function () {
    let scrollMode = await sails.helpers.settings.get('FOG_TABLE_SCROLL_MODE');
    let pageLength = await sails.helpers.settings.get('FOG_VIEW_DEFAULT_SCREEN');
    return {scrollMode, pageLength};
  }
};
