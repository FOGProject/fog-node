const assert = require('assert');

describe('seed-demo', () => {
  // Under a Sails lift, Sails loads api/services/mac-oui.json as a service and
  // adds a `sails` object to the cached JSON. seed-demo required after the
  // lift gets that object, so the OUI pool must skip the non-string entry.
  it('builds the OUI pool when required after Sails lifts', () => {
    assert.ok(sails.services['mac-oui'], 'the mac-oui service should be loaded');
    const file = require.resolve('../../tools/setup/seed-demo');
    delete require.cache[file];
    const {buildOuiPool} = require(file);
    const pool = buildOuiPool();
    assert.ok(pool.length > 0);
    assert.ok(pool.every((oui) => /^[0-9A-F]{6}$/i.test(oui)), 'every entry is an OUI');
  });
});
