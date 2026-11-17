/**
 * The FOG settings catalog
 * (sails.config.fogSettings)
 *
 * The one code-side list of the runtime settings an admin may change while
 * fog-node runs. The database holds only the values an admin changed: one
 * Setting record per changed key. A key with no record, or with a bad stored
 * value, reads as its `default`. Read a value with
 * `await sails.helpers.settings.get(key)` (api/helpers/settings/get.js).
 *
 * FOG 1.6 keeps the same facts in `globalSettings` rows that
 * commons/schema.php seeds, plus a per-key switch in
 * FOGConfigurationPage.php. fog-node seeds no rows (`migrate: 'safe'`), so
 * the types, choices and validation live here, next to the readers.
 *
 * What goes in:
 *
 * - A key enters the catalog in the same change as the code that reads it,
 *   or in the change that moves its reader onto `sails.helpers.settings.get`.
 *   No key is listed for later: a listed key with no reader is a control
 *   that does nothing.
 * - Install-time configuration (the database URL, ports, paths, secrets)
 *   stays in config/local.js, which `npm run setup` writes. The catalog
 *   holds only what an admin may change while fog-node runs.
 * - A credential or a secret never goes in the catalog.
 * - The `schema` record (written by tools/setup/lib/schema.js, read by
 *   `npm run migrate`) is not a setting, and is never a catalog key.
 *
 * Each entry, keyed by the FOG 1.6 setting name:
 *
 *   category     the FOG 1.6 category name, e.g. 'FOG View Settings'
 *   description  the FOG 1.6 settingDesc text, as plain text (no HTML)
 *   type         'select', 'number', 'text' or 'checkbox'
 *   options      for a 'select' only: an array of {value, label}
 *   default      the value when no record exists or the stored value is bad
 *   normalize    (value) => the cleaned value, or undefined for a bad value.
 *                The Setting value column is type json, so a stored value
 *                can be a string or a number.
 *   reload       true when the change takes effect after a page reload
 *                (the FOG 1.6 reload flag)
 */

module.exports.fogSettings = {

  // The list page tables (api/helpers/table-settings.js, issue #150).
  // 1.6 schema.php step 296.
  FOG_TABLE_SCROLL_MODE: {
    category: 'FOG View Settings',
    description: 'This setting defines how the management tables page through '
      + 'records. infinite loads rows as you scroll; paged uses the classic '
      + 'page-number bar.',
    type: 'select',
    options: [
      {value: 'infinite', label: 'Infinite scroll'},
      {value: 'paged', label: 'Paged'}
    ],
    default: 'infinite',
    // 'infinite' or 'paged', in any case and with surrounding spaces.
    normalize: (value) => {
      let mode = String(value).trim().toLowerCase();
      return (mode === 'infinite' || mode === 'paged') ? mode : undefined;
    },
    reload: true
  },

  // The rows per page of a list table with no saved per-user layout
  // (api/helpers/table-settings.js, issue #150). The description is the
  // repaired text of 1.6 schema.php step 397.
  FOG_VIEW_DEFAULT_SCREEN: {
    category: 'FOG View Settings',
    description: 'This setting defines how many rows a management list shows '
      + 'to a user who has not yet saved a layout of their own. Column order, '
      + 'visibility, sort and row count are remembered per user once changed, '
      + 'so this is the starting default rather than a fixed limit.',
    type: 'select',
    options: [
      {value: 10, label: '10'},
      {value: 25, label: '25'},
      {value: 50, label: '50'},
      {value: 100, label: '100'},
      {value: -1, label: 'All'}
    ],
    default: 25,
    // Whole numbers only: a positive count, or -1 for all rows. A numeric
    // string such as '50' counts. A count the picker does not offer stays
    // valid, as in 1.6.
    normalize: (value) => {
      let text = String(value).trim();
      return /^(-1|[1-9][0-9]*)$/.test(text) ? Number(text) : undefined;
    },
    reload: true
  }

};
