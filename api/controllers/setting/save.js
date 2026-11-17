/**
 * POST /api/v1/setting/save
 *
 * Stores one setting of the FOG settings catalog (config/fog-settings.js)
 * from the FOG Settings page (views/pages/partials/settings.js), as 1.6
 * FOGConfigurationPage::settingsPost does (FOGConfigurationPage.php:5218).
 * Body: {key, value}. Needs setting.update.
 *
 * - A key that is not in the catalog answers 400
 *   {error: 'Unknown setting: <key>', title: 'Settings Update Fail'}.
 * - A value that the entry's normalize() rejects answers 400
 *   {error: '<key> value is not valid', title: 'Settings Update Fail'}.
 * - Otherwise it stores the normalized value in the Setting record of that
 *   name (updated, or created) and answers 202 with the 1.6 success body
 *   (FOGConfigurationPage.php:5534-5552).
 *
 * A 400 stores nothing. req.audit names the stored setting, so the audit
 * hook's row (api/hooks/audit) says which one changed.
 */
module.exports = {
  friendlyName: 'Save a setting',
  description: 'Store one catalog setting, validated by its normalize().',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!sails.helpers.audit.can(req, 'setting.update')) {
      return res.forbidden();
    }
    const fail = (error) => res.status(400).json({error, title: 'Settings Update Fail'});
    const catalog = sails.config.fogSettings;
    const key = _.get(req.body, 'key');
    // Own keys only, as sails.helpers.settings.get reads them: neither
    // 'constructor' nor the 'schema' record is a setting. A key that is not
    // a string is named by its JSON: a template string would call its
    // toString, which a JSON body can replace ({"toString": 1} throws).
    if (typeof key !== 'string' || !Object.hasOwn(catalog, key)) {
      return fail(`Unknown setting: ${typeof key === 'string' ? key : JSON.stringify(key)}`);
    }
    // normalize() gets a string or a number only, as a form or a stored
    // record holds. An object or an array is not a valid value, and an
    // object can make String() throw.
    const raw = _.get(req.body, 'value');
    const value = (typeof raw === 'string' || typeof raw === 'number') ? catalog[key].normalize(raw) : undefined;
    if (value === undefined) {
      return fail(`${key} value is not valid`);
    }
    let row = await sails.models.setting.findOne({name: key});
    if (row) {
      row = await sails.models.setting.updateOne({id: row.id}).set({value});
    } else {
      row = await sails.models.setting.create({name: key, value}).fetch();
    }
    sails.helpers.audit.subject(req, 'setting', row);
    return res.status(202).json({msg: 'Settings successfully stored!', title: 'Settings Update Success'});
  }
};
