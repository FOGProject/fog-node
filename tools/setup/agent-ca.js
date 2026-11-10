/**
 * npm run agent-ca -- <backup|restore|status> [--passphrase-file <path>]
 *
 * The backup of the fog-agent CA keys in the database (api/lib/agent-ca-escrow.js).
 *   backup   seal the four CA files of the PKI folder under a passphrase and
 *            replace any backup. Without --passphrase-file, the passphrase is
 *            generated and printed once.
 *   restore  write the four CA files from the backup into an empty PKI
 *            folder, then make the bundle and the server certificate. Without
 *            --passphrase-file, it asks for the passphrase (3 tries).
 *   status   show whether a backup exists and whether it matches the recorded
 *            CAs and the files on disk.
 * The logic is in tools/setup/agent-ca-lib.js. This file loads Sails with the
 * setup config (tools/setup/lib/schema.js sailsConfig) and creates no Role,
 * User or schema Setting. It exits 0, or prints the error and exits 1.
 */
const sails = require('sails');
const config = require('../lib/config');
const inquire = require('./lib/inquire');
const schema = require('./lib/schema');
const pki = require('./pki');
const lib = require('./agent-ca-lib');
const escrow = require('../../api/lib/agent-ca-escrow');

const USAGE = 'Usage: npm run agent-ca -- <backup|restore|status> [--passphrase-file <path>]';

const command = process.argv[2];
const fileAt = process.argv.indexOf('--passphrase-file');
const passphraseFile = fileAt === -1 ? null : process.argv[fileAt + 1];

let loaded = false;
const finish = (err) => {
  if (err) console.error(err.message || err);
  const exit = () => process.exit(err ? 1 : 0);
  if (loaded) return sails.lower(exit);
  exit();
};

const run = async () => {
  const pkiDir = pki.pkiDirFor(config.appPath);
  const models = {pkiDir, settings: sails.models.setting, escrows: sails.models.agentcaescrow};
  if (command === 'backup') {
    const passphrase = passphraseFile ? pki.readPassphraseFile(passphraseFile) : escrow.generatePassphrase();
    const result = await lib.backup(Object.assign({passphrase}, models));
    console.log(`The agent CA backup is saved in the database (root ${result.rootFingerprint}).`);
    if (!passphraseFile) pki.printPassphrase(passphrase);
  } else if (command === 'restore') {
    // Asked only after every refusal check (pki.restoreBackup).
    const getPassphrase = async () => (passphraseFile ? pki.readPassphraseFile(passphraseFile)
      : inquire.askPassphrase('Enter the agent CA backup passphrase:'));
    const tries = passphraseFile ? 1 : pki.INTERACTIVE_TRIES;
    await lib.restore(Object.assign({getPassphrase, tries, log: console.log}, models));
    console.log(`The agent CA files are restored to ${pkiDir}.`);
  } else {
    for (const line of (await lib.status(models)).lines) console.log(line);
  }
};

if (!['backup', 'restore', 'status'].includes(command) || (fileAt !== -1 && !passphraseFile)) {
  console.error(USAGE);
  process.exit(1);
}

sails.load(schema.sailsConfig(), (err) => {
  if (err) return finish(err);
  loaded = true;
  run().then(() => finish(), finish);
});
