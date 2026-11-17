const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {readOldLocal, customLines} = require('../../tools/setup/pki');

// What the setup tools keep from an existing config/local.js
// (tools/setup/pki.js readOldLocal and customLines).
describe('Setup keeps custom.logDir::', () => {
  let app;

  beforeEach(() => {
    app = fs.mkdtempSync(path.join(os.tmpdir(), 'fog-node-oldlocal-'));
    fs.mkdirSync(path.join(app, 'config'));
  });

  afterEach(() => fs.rmSync(app, {recursive: true, force: true}));

  it('readOldLocal returns the logDir of an existing local.js', () => {
    fs.writeFileSync(path.join(app, 'config', 'local.js'), "module.exports = {custom: {logDir: '/var/log/fog-node', pkiDir: '/p'}};\n");
    const old = readOldLocal(app);
    assert.strictEqual(old.logDir, '/var/log/fog-node');
    assert.strictEqual(old.pkiDir, '/p');
  });

  it('readOldLocal returns no logDir without the file or the setting', () => {
    assert.strictEqual(readOldLocal(app).logDir, undefined);
    fs.writeFileSync(path.join(app, 'config', 'local.js'), 'module.exports = {custom: {}};\n');
    assert.strictEqual(readOldLocal(app).logDir, undefined);
  });

  it('customLines writes a logDir line only when there is one', () => {
    assert.ok(customLines({logDir: '/x'}).includes("logDir: '/x'"));
    assert.ok(!customLines({}).includes('logDir'));
    assert.ok(customLines({pkiOverride: '/p', logDir: '/x'}).includes("pkiDir: '/p'"));
    assert.strictEqual(customLines({}), '');
  });
});
