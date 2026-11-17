/**
 * Reads one runtime setting from the FOG settings catalog
 * (config/fog-settings.js, sails.config.fogSettings).
 *
 * It reads the key's Setting record and returns the entry's normalize() of
 * the stored value. A missing record, or a stored value that normalize()
 * rejects, gives the entry's default. It only reads: it never creates a
 * record, so an install with no record keeps the default.
 *
 * A key that is not in the catalog throws "Unknown setting: <key>", so a
 * typo in a reader fails loudly instead of reading a default forever.
 *
 * Usage: await sails.helpers.settings.get('FOG_VIEW_DEFAULT_SCREEN')
 *   -> 25
 */
module.exports = {
  friendlyName: 'Get a setting',
  description: 'The normalized value of one catalog setting, or its default.',
  inputs: {
    key: {type: 'string', required: true, description: 'The setting name, e.g. FOG_TABLE_SCROLL_MODE.'}
  },
  exits: {
    success: {outputType: 'ref', description: 'The normalized value, or the default.'}
  },
  fn: async function ({key}) {
    let catalog = sails.config.fogSettings;
    // Own keys only, so a name such as 'constructor' is not a setting.
    if (!Object.hasOwn(catalog, key)) {
      throw new Error(`Unknown setting: ${key}`);
    }
    let entry = catalog[key];
    let row = await sails.models.setting.findOne({name: key});
    if (row) {
      let value = entry.normalize(row.value);
      if (value !== undefined) {
        return value;
      }
    }
    return entry.default;
  }
};
