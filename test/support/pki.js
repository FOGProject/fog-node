const fs = require('fs');
const os = require('os');
const path = require('path');
const {ensurePki} = require('../../tools/setup/pki');
const {ROOT_SETTING, ROOT_SETTING_DESCRIPTION, fingerprintOf} = require('../../api/lib/agent-pki');

// One PKI for the whole mocha run. RSA-4096 generation is slow, so the tests
// share it. The folder is read-only for the tests: one that deletes, replaces
// or renames a file calls copy() first and works in its own copy.
let shared;
// A second, unrelated PKI, for the tests that need a certificate from another
// root. Made on first use only, for the same reason.
let foreignPki;

const make = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return ensurePki(dir).then(() => dir);
};

// The shared PKI folder (a promise of its path). The first call makes it.
const fixture = () => {
  if (!shared) shared = make('fog-pki-fixture-');
  return shared;
};

// The foreign PKI folder (a promise of its path). Read-only, as the fixture.
const foreign = () => {
  if (!foreignPki) foreignPki = make('fog-pki-foreign-');
  return foreignPki;
};

// The fingerprint of the root in a PKI folder.
const rootOf = (dir) => fingerprintOf(fs.readFileSync(path.join(dir, 'root.pem')));

// Set the root fingerprint Setting to a value, or remove it with undefined.
// An existing record keeps its description; a new one gets the setup text.
const setRoot = async (value) => {
  if (value === undefined) return Setting.destroy({name: ROOT_SETTING});
  const updated = await Setting.updateOne({name: ROOT_SETTING}).set({value});
  if (!updated) await Setting.create({name: ROOT_SETTING, description: ROOT_SETTING_DESCRIPTION, value});
};

// Point sails.config.custom.pkiDir at the shared fixture for one describe
// block, and restore it after. The Setting that records the agent root is set
// to the fixture root, and put back as it was (or removed) after. Returns a
// getter for the fixture path.
const useFixture = () => {
  let dir;
  let saved;
  let savedRoot;
  before(async () => {
    dir = await fixture();
    saved = sails.config.custom.pkiDir;
    sails.config.custom.pkiDir = dir;
    const record = await Setting.findOne({name: ROOT_SETTING});
    savedRoot = record ? record.value : undefined;
    await setRoot(rootOf(dir));
  });
  after(async () => {
    sails.config.custom.pkiDir = saved;
    await setRoot(savedRoot);
  });
  return () => dir;
};

// A root-level hook: mocha loads this file with the specs, so it runs once at
// the end of the run and removes both shared folders.
after(async () => {
  for (const p of [shared, foreignPki]) {
    if (p) fs.rmSync(await p, {recursive: true, force: true});
  }
});

// A private copy of a folder, for a test that changes files.
const copy = (dir) => {
  const to = fs.mkdtempSync(path.join(os.tmpdir(), 'fog-pki-copy-'));
  fs.cpSync(dir, to, {recursive: true});
  return to;
};

module.exports = {fixture, foreign, useFixture, copy, rootOf, setRoot};
