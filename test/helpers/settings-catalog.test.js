const assert = require('assert');

// The FOG settings catalog (config/fog-settings.js) and its read helper
// (api/helpers/settings/get.js), issue #198.
describe('Settings catalog::', () => {
  const KEY = 'FOG_VIEW_DEFAULT_SCREEN';
  const TYPES = ['select', 'number', 'text', 'checkbox'];
  const catalog = () => sails.config.fogSettings;
  const get = (key) => sails.helpers.settings.get(key);

  // The test owns the FOG_VIEW_DEFAULT_SCREEN record: none before, none after.
  const cleanup = () => sails.models.setting.destroy({name: KEY});
  before(cleanup);
  afterEach(cleanup);

  it('holds the two table settings', () => {
    ['FOG_TABLE_SCROLL_MODE', 'FOG_VIEW_DEFAULT_SCREEN'].forEach((key) => assert.ok(Object.hasOwn(catalog(), key), `no ${key}`));
  });

  it('gives every entry the full shape, and a default that normalizes to itself', () => {
    for (const [key, entry] of Object.entries(catalog())) {
      assert.strictEqual(typeof entry.category, 'string', `${key}.category`);
      assert.ok(entry.category.length, `${key}.category is empty`);
      assert.strictEqual(typeof entry.description, 'string', `${key}.description`);
      assert.ok(entry.description.length, `${key}.description is empty`);
      assert.ok(!/[<>]/.test(entry.description), `${key}.description has HTML`);
      assert.ok(TYPES.includes(entry.type), `${key}.type is ${entry.type}`);
      assert.strictEqual(typeof entry.normalize, 'function', `${key}.normalize`);
      assert.strictEqual(typeof entry.reload, 'boolean', `${key}.reload`);
      assert.ok('default' in entry, `${key}.default`);
      assert.strictEqual(entry.normalize(entry.default), entry.default, `${key}.default does not normalize to itself`);
      if (entry.type === 'select') {
        assert.ok(Array.isArray(entry.options) && entry.options.length, `${key}.options`);
        for (const option of entry.options) {
          assert.ok('value' in option && typeof option.label === 'string', `${key} option ${JSON.stringify(option)}`);
          assert.strictEqual(entry.normalize(option.value), option.value, `${key} option ${option.value} does not normalize to itself`);
        }
      }
    }
  });

  it('has no schema key', () => {
    assert.strictEqual(catalog().schema, undefined);
  });

  it('returns the default with no record, and creates none', async () => {
    assert.strictEqual(await get(KEY), 25);
    assert.strictEqual(await sails.models.setting.count({name: KEY}), 0);
  });

  it('returns the normalized value of a good record', async () => {
    await sails.models.setting.create({name: KEY, value: '50'});
    assert.strictEqual(await get(KEY), 50);
  });

  it('returns the default for a bad record', async () => {
    await sails.models.setting.create({name: KEY, value: 'abc'});
    assert.strictEqual(await get(KEY), 25);
  });

  it('rejects an unknown key, naming it', async () => {
    await assert.rejects(get('NOPE'), (err) => err.message.includes('Unknown setting: NOPE'));
  });

  it('rejects an inherited property name as unknown', async () => {
    await assert.rejects(get('constructor'), /Unknown setting: constructor/);
  });

  // Issue #201: four readers moved onto the catalog. The HARD rule is that
  // each reader makes the same decision as before, for every stored value.
  // Each OLD function is the reader's own rule, copied from the code it
  // replaced (the file and line are named). `row` is the Setting record, or
  // null for none, as findOne answered.
  describe('the four moved readers::', () => {
    const NO_ROW = Symbol('no row');
    const INPUTS = [NO_ROW, '', '0', 0, '1', 1, true, false, 'false', 'abc', '90.5', -5,
      'OFF', ' off ', 'log', 'enforce', null, {}];

    // api/helpers/agent/resolve-host.js: smbiosOff.
    const oldSmbiosOff = (row) => !!row && String(row.value).trim().toLowerCase() === 'off';
    // api/helpers/agent/auto-approve.js: hours (DEFAULT_WINDOW_HOURS was 24).
    const oldHours = (row) => {
      const window = row ? Number(row.value) : 24;
      return Number.isNaN(window) ? 24 : window;
    };
    // api/controllers/agent/poll.js: poll_interval (DEFAULT_POLL_INTERVAL was 60).
    const oldInterval = (row) => {
      const interval = parseInt(row && row.value, 10);
      return Number.isNaN(interval) ? 60 : interval;
    };
    // api/helpers/form-generator.js: showPasswords, with its settingOn rule.
    const oldShowPasswords = (row) => !!row && (!!row.value && row.value !== '0' && row.value !== 'false');

    const CASES = [
      ['FOG_HOST_IDENTIFY_SMBIOS', oldSmbiosOff, async () => (await get('FOG_HOST_IDENTIFY_SMBIOS')) === 'off'],
      ['FOG_AGENT_ENROLL_DEPLOY_WINDOW', oldHours, () => get('FOG_AGENT_ENROLL_DEPLOY_WINDOW')],
      ['FOG_CLIENT_CHECKIN_TIME', oldInterval, () => get('FOG_CLIENT_CHECKIN_TIME')],
      ['FOG_ENABLE_SHOW_PASSWORDS', oldShowPasswords, () => get('FOG_ENABLE_SHOW_PASSWORDS')]
    ];

    // Setting.value is json and required, so Waterline refuses '' and null.
    // The fixture row goes through the raw collection.
    const coll = () => sails.getDatastore(sails.models.setting.datastore).manager.collection(sails.models.setting.tableName);
    const names = CASES.map(([key]) => key);
    // The records as they were, put back after (a dev database may hold some).
    let before;
    const wipe = () => coll().deleteMany({name: {$in: names}});
    beforeEach(async () => {
      before = await coll().find({name: {$in: names}}).toArray();
      await wipe();
    });
    afterEach(async () => {
      await wipe();
      if (before.length) { await coll().insertMany(before); }
    });

    it('holds the four keys', () => {
      names.forEach((key) => assert.ok(Object.hasOwn(catalog(), key), `no ${key}`));
    });

    for (const [key, oldRule, newRule] of CASES) {
      it(`${key}: the catalog path decides as the old reader did, for every input`, async () => {
        for (const input of INPUTS) {
          await wipe();
          let row = null;
          if (input !== NO_ROW) {
            await coll().insertOne({name: key, value: input});
            row = {value: input};
          }
          const label = input === NO_ROW ? 'no row' : JSON.stringify(input);
          assert.deepStrictEqual(await newRule(), oldRule(row), `${key} with ${label}`);
        }
      });
    }
  });
});
