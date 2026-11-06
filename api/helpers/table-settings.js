/**
 * The list page table settings (issue #150), read from two Setting records:
 *
 *   FOG_TABLE_SCROLL_MODE   'infinite' or 'paged' (any case). Default 'infinite'.
 *   FOG_VIEW_DEFAULT_SCREEN A positive whole number of rows per page, or -1
 *                           for all rows. A numeric string such as '50' counts.
 *                           Default 25.
 *
 * A missing record or a bad value falls back to its default. The helper only
 * reads: it never creates a record, so an install with no record keeps the
 * defaults. The value column is type json, so a value can be a string or a
 * number.
 *
 * Usage: await sails.helpers.tableSettings()
 *   -> {scrollMode: 'infinite', pageLength: 25}
 */
const DEFAULT_SCROLL_MODE = 'infinite';
const DEFAULT_PAGE_LENGTH = 25;

module.exports = {
  friendlyName: 'Table settings',
  description: 'The list page scroll mode and page length, from the Setting records.',
  inputs: {},
  exits: {
    success: {outputType: 'ref', description: '{scrollMode, pageLength}'}
  },
  fn: async function () {
    let scrollSetting = await sails.models.setting.findOne({name: 'FOG_TABLE_SCROLL_MODE'});
    let lengthSetting = await sails.models.setting.findOne({name: 'FOG_VIEW_DEFAULT_SCREEN'});

    let scrollMode = DEFAULT_SCROLL_MODE;
    if (scrollSetting) {
      let mode = String(scrollSetting.value).trim().toLowerCase();
      if (mode === 'infinite' || mode === 'paged') {
        scrollMode = mode;
      }
    }

    let pageLength = DEFAULT_PAGE_LENGTH;
    if (lengthSetting) {
      let text = String(lengthSetting.value).trim();
      // Whole numbers only: a positive count, or -1 for all rows.
      if (/^(-1|[1-9][0-9]*)$/.test(text)) {
        pageLength = Number(text);
      }
    }

    return {scrollMode, pageLength};
  }
};
