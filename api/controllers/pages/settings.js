const path = require('path');

// GET /about/settings: the FOG 1.6 FOG Settings page
// (FOGConfigurationPage::settings and _renderSettings,
// FOGConfigurationPage.php:5638-5870). It lists every key of the settings
// catalog (config/fog-settings.js) with its value from
// sails.helpers.settings.get, one panel per category. A Setting record whose
// name is not a catalog key, such as `schema`, never shows. Each control
// saves on change through POST /api/v1/setting/save
// (api/controllers/setting/save.js, views/pages/partials/settings.js).

// The control types this page renders. Both catalog keys are `select`. The
// change that adds the first number, text or checkbox key adds its control.
const RENDERED_TYPES = ['select'];

// The 1.6 reload note, added to the label tooltip of a `reload: true` row
// (FOGConfigurationPage.php _renderSettings, $refreshtip).
const RELOAD_TIP = 'Changing this setting takes effect after you reload the page. '
  + 'A hard refresh (Ctrl+F5, or Cmd+Shift+R) may be required.';

// Natural order without case, as 1.6 ksort(SORT_NATURAL | SORT_FLAG_CASE).
const natural = (a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});

// The options of a select, with the stored value selected. A valid stored
// value that is not one of the options (FOG_VIEW_DEFAULT_SCREEN = 30) is one
// more option, labeled with the value, so the page shows what is stored.
function selectOptions(entry, value) {
  const options = entry.options.map((option) => ({
    value: String(option.value),
    label: option.label,
    selected: String(option.value) === String(value)
  }));
  if (!options.some((option) => option.selected)) {
    options.push({value: String(value), label: String(value), selected: true});
  }
  return options;
}

module.exports = {
  friendlyName: 'FOG Settings',
  description: 'The FOG Settings page.',
  exits: {
    forbidden: {
      responseType: 'forbidden'
    },
    success: {
      viewTemplatePath: 'pages/settings'
    }
  },
  fn: async function () {
    if (!sails.helpers.audit.can(this.req, 'setting.read')) {
      throw 'forbidden';
    }
    const catalog = sails.config.fogSettings;
    const byCategory = {};
    for (const key of Object.keys(catalog).sort(natural)) {
      const entry = catalog[key];
      // A thrown Error answers 500, and Sails logs its message.
      if (!RENDERED_TYPES.includes(entry.type)) {
        throw new Error(`FOG Settings: the catalog key ${key} has the type "${entry.type}", and this page renders no control for it`);
      }
      const value = await sails.helpers.settings.get(key);
      (byCategory[entry.category] = byCategory[entry.category] || []).push({
        key,
        description: entry.description,
        reload: entry.reload,
        // One tooltip on the label: the description, then the reload note.
        tip: entry.reload ? `${entry.description}  —  ${RELOAD_TIP}` : entry.description,
        options: selectOptions(entry, value)
      });
    }
    return {
      // The FOG 1.6 content header and tab title (FOGConfigurationPage.php:64, :5640).
      section: 'FOG Configuration',
      page: 'FOG Settings',
      categories: Object.keys(byCategory).sort(natural).map((name) => ({name, rows: byCategory[name]})),
      // false disables every control. The save route checks setting.update
      // itself, so this only spares a user a save that is refused.
      canUpdate: sails.helpers.audit.can(this.req, 'setting.update'),
      partialname: path.join(__dirname, '..', '..', '..', 'views', 'pages', 'partials', 'settings.js')
    };
  }
};
