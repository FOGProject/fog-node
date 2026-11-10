const fs = require('fs');
const os = require('os');
const path = require('path');
const {ensurePki} = require('../../tools/setup/pki');

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

// Point sails.config.custom.pkiDir at the shared fixture for one describe
// block, and restore it after. Returns a getter for the fixture path.
const useFixture = () => {
  let dir;
  let saved;
  before(async () => {
    dir = await fixture();
    saved = sails.config.custom.pkiDir;
    sails.config.custom.pkiDir = dir;
  });
  after(() => { sails.config.custom.pkiDir = saved; });
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

module.exports = {fixture, foreign, useFixture, copy};
