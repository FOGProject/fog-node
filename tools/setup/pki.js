/**
 * The setup step for the fog-agent certificate authorities. Making the CA and
 * server certificate files (ensurePki) is in api/lib/agent-pki-files.js,
 * because the agent-tls hook uses it at lift too. This file adds the root
 * guard, the Settings that record the root and the agent CA, the agent CA
 * backup in the database (api/lib/agent-ca-escrow.js), and the pkiDir lookup.
 */
const fs = require('fs');
const path = require('path');
const shared = require('../../api/lib/agent-pki');
const files = require('../../api/lib/agent-pki-files');
const escrow = require('../../api/lib/agent-ca-escrow');

const {ensurePki, isRootError, rootError, stamp, exists} = files;
const {ROOT_SETTING, ROOT_SETTING_DESCRIPTION, AGENT_CA_SETTING, AGENT_CA_SETTING_DESCRIPTION, fingerprintOf} = shared;

// The fingerprint of a certificate in the PKI folder.
const fingerprintIn = (pkiDir, name) => fingerprintOf(fs.readFileSync(path.join(pkiDir, name), 'utf8'));

// The value of a Setting, or undefined.
const settingValue = async (settings, name) => {
  const record = await settings.findOne({name});
  return record ? record.value : undefined;
};

// Write a Setting: update it, or create it with its description.
const writeSetting = async (settings, name, description, value) => {
  const updated = await settings.updateOne({name}).set({value});
  if (!updated) await settings.create({name, description, value});
};

// The one backup record, or undefined.
const findEscrow = async (escrows) => (await escrows.find({}).limit(1))[0];

// One agent.ca audit row (docs/adr/0003-audit-trail.md). The text never holds a passphrase or a key.
const auditCa = (outcome, text) => sails.helpers.audit.record.with({
  req: null,
  row: {type: 'agent.ca', createdBy: '(system)', authSource: 'setup', outcome, text}
});
// The first 16 hex characters of a fingerprint, for an audit text.
const shortRoot = (fingerprint) => String(fingerprint).replace(/:/g, '').slice(0, 16);

const {escrowError} = escrow;

// How many passphrases an interactive restore asks for (npm run setup, npm run agent-ca).
const INTERACTIVE_TRIES = 3;

/**
 * Seal the four CA files of pkiDir under the passphrase, store the record as
 * the one backup (create it, then remove any other), and write the allowed
 * row. setupPki and npm run agent-ca -- backup both use it.
 */
const saveBackup = async ({pkiDir, escrows, passphrase, rootFingerprint}) => {
  const created = await escrows.create(await escrow.seal(pkiDir, passphrase)).fetch();
  await escrows.destroy({id: {'!=': created.id}});
  await auditCa('allowed', `agent CA backup saved, root ${shortRoot(rootFingerprint)}`);
};

/**
 * Restore the four CA files of the backup into pkiDir, then make the bundle and
 * the server certificate (ensurePki with the recorded root). setupPki and
 * npm run agent-ca -- restore both use it. It refuses, before any file is
 * written, with these codes:
 *   E_ESCROW_NONE        no backup
 *   E_ESCROW_OTHER_ROOT  the backup is not of the recorded root
 *   E_ESCROW_OLDER       the backup is not of the recorded agent CA, or that Setting is unset
 *   E_ESCROW_FILES       a CA file is in pkiDir
 * getPassphrase({purpose: 'restore'}) is asked up to `tries` times. Each wrong
 * passphrase writes one denied row; after the last it throws
 * E_ESCROW_PASSPHRASE. A null passphrase throws E_ESCROW_NO_PASSPHRASE, and an
 * invalid record E_ESCROW_RECORD. Returns the ensurePki result.
 */
const restoreBackup = async ({pkiDir, settings, escrows, sans, getPassphrase, tries = 1, log = () => {}}) => {
  const backup = await findEscrow(escrows);
  if (!backup) throw escrowError('E_ESCROW_NONE', 'The database holds no agent CA backup.');
  const recorded = await settingValue(settings, ROOT_SETTING);
  if (backup.rootFingerprint !== recorded) throw escrowError('E_ESCROW_OTHER_ROOT', 'The agent CA backup is not of the recorded root.');
  // A backup of an older agent CA would cut off agents enrolled since.
  const recordedCa = await settingValue(settings, AGENT_CA_SETTING);
  if (!recordedCa || backup.agentCaFingerprint !== recordedCa) {
    throw escrowError('E_ESCROW_OLDER', 'The database backup holds an older agent CA; restoring it would cut off agents enrolled since. ' +
      'Restore the pki folder from a file backup.');
  }
  // A partial folder is never mixed with the backup.
  if (escrow.CA_FILES.some((name) => exists(path.join(pkiDir, name)))) {
    throw escrowError('E_ESCROW_FILES', `Move the remaining CA files out of ${pkiDir} first.`);
  }
  log(`${pkiDir} has no agent root, but the database holds a backup of it.`);
  let wrong;
  for (let attempt = 0; attempt < tries; attempt++) {
    const passphrase = await getPassphrase({purpose: 'restore'});
    if (passphrase === null || passphrase === undefined) throw escrowError('E_ESCROW_NO_PASSPHRASE', 'No passphrase was given.');
    let texts;
    try {
      texts = await escrow.open(backup, passphrase);
    } catch (err) {
      if (err.code !== 'E_ESCROW_PASSPHRASE') throw err;
      await auditCa('denied', 'agent CA restore refused: wrong passphrase');
      // The last wrong try is thrown below, and the caller prints it, so log only the earlier ones.
      if (attempt < tries - 1) log(err.message);
      wrong = err;
      continue;
    }
    escrow.restore(pkiDir, texts);
    // The root now matches: ensurePki re-makes the bundle and the server certificate.
    const result = await ensurePki(pkiDir, {expectedRoot: recorded, sans});
    await auditCa('allowed', `agent CA restored from the backup, root ${shortRoot(result.rootFingerprint)}`);
    return result;
  }
  throw wrong;
};

/**
 * The backup step of setupPki, after both Settings are written. No backup, or
 * one of another root or agent CA: ask for a passphrase and seal a new one.
 * A matching backup: nothing to do.
 */
const updateEscrow = async ({pkiDir, escrows, getPassphrase, log, rootFingerprint, agentCaFingerprint}) => {
  const backup = await findEscrow(escrows);
  if (backup && backup.rootFingerprint === rootFingerprint && backup.agentCaFingerprint === agentCaFingerprint) return;
  const purpose = backup ? 'replace' : 'new';
  const passphrase = await getPassphrase({purpose});
  if (passphrase === null || passphrase === undefined) {
    log(backup ? 'The agent CA backup is out of date. Run: npm run agent-ca -- backup'
      : 'No agent CA backup was made. Run: npm run agent-ca -- backup');
    return;
  }
  await saveBackup({pkiDir, escrows, passphrase, rootFingerprint});
};

/**
 * The setup step for the agent CAs. It records the root fingerprint in the
 * Setting ROOT_SETTING and the agent CA fingerprint in AGENT_CA_SETTING
 * (api/lib/agent-pki.js), and refuses another root while ROOT_SETTING is set.
 * - settings: the Setting model. log: a function for the printed lines.
 * - newRoot: true after --new-agent-root. With a recorded root, the four CA
 *   files that exist get a timestamp suffix, so ensurePki makes new CAs.
 * - command: 'setup' or 'setup:dev', the npm script that the messages name.
 * - sans: the SAN list of the server certificate (ensurePki). Unset: the default list.
 * - escrows: the AgentCaEscrow model. Unset: no backup step and no restore.
 * - getPassphrase({purpose}): async; a normalized passphrase or null.
 *   purpose is 'new', 'replace' or 'restore'.
 * - restoreTries: how many passphrases a restore asks for. Default 1; the
 *   interactive installer passes INTERACTIVE_TRIES.
 * Returns {rootFingerprint}. A refusal throws an error that keeps its code
 * (E_AGENT_ROOT_MISSING or E_AGENT_ROOT_MISMATCH) and has the full message.
 */
const setupPki = async ({pkiDir, newRoot, settings, log, command, sans, escrows, getPassphrase, restoreTries = 1}) => {
  const recorded = await settingValue(settings, ROOT_SETTING);
  const replace = Boolean(newRoot && recorded);

  if (replace) {
    const suffix = stamp();
    for (const name of ['root.pem', 'root.key', 'agent-ca.pem', 'agent-ca.key']) {
      const file = path.join(pkiDir, name);
      if (exists(file)) fs.renameSync(file, `${file}.${suffix}`);
    }
  }

  let result;
  try {
    result = await ensurePki(pkiDir, {expectedRoot: replace ? undefined : recorded, sans});
  } catch (err) {
    if (!isRootError(err)) throw err;
    const fail = (extra) => rootError(err.code, `${err.message}\n` +
      `Restore the pki folder from your backup to ${pkiDir}, then run setup again.\n` +
      'To start over with a new root on purpose (every enrolled agent must then be re-enrolled by hand), ' +
      `run: npm run ${command} -- --new-agent-root` + extra.map((line) => `\n${line}`).join(''));
    // E_AGENT_ROOT_MISMATCH never restores.
    if (!escrows || err.code !== 'E_AGENT_ROOT_MISSING') throw fail([]);
    const notOpened = (reason) => fail([...reason, 'The agent CA backup was not opened.',
      ...(command === 'setup:dev' ? ['Run it again with --agent-ca-passphrase-file <file>.'] : [])]);
    try {
      result = await restoreBackup({pkiDir, settings, escrows, sans, getPassphrase, tries: restoreTries, log});
    } catch (refused) {
      // No backup of the recorded root: nothing to add to the root error.
      if (refused.code === 'E_ESCROW_NONE' || refused.code === 'E_ESCROW_OTHER_ROOT') throw fail([]);
      if (refused.code === 'E_ESCROW_OLDER' || refused.code === 'E_ESCROW_FILES') throw fail([refused.message]);
      if (refused.code === 'E_ESCROW_RECORD') throw notOpened([refused.message]);
      if (refused.code === 'E_ESCROW_PASSPHRASE' || refused.code === 'E_ESCROW_NO_PASSPHRASE') throw notOpened([]);
      throw refused;
    }
  }

  if (replace) log('A new agent root was made. Every enrolled fog-agent must be re-enrolled with the new ca.cert.pem.');

  await writeSetting(settings, ROOT_SETTING, ROOT_SETTING_DESCRIPTION, result.rootFingerprint);
  const agentCaFingerprint = fingerprintIn(pkiDir, 'agent-ca.pem');
  await writeSetting(settings, AGENT_CA_SETTING, AGENT_CA_SETTING_DESCRIPTION, agentCaFingerprint);

  if (escrows) {
    await updateEscrow({pkiDir, escrows, getPassphrase, log, rootFingerprint: result.rootFingerprint, agentCaFingerprint});
  }
  return result;
};

/**
 * What the setup tools keep from an existing config/local.js: custom.pkiDir
 * (the CA keys are there) and http.trustProxy. Both are undefined without the
 * file. The setup tools carry them into the local.js they write, so a re-run
 * keeps them.
 */
const readOldLocal = (appPath) => {
  const localCfg = path.join(appPath, 'config', 'local.js');
  if (!exists(localCfg)) return {pkiDir: undefined, trustProxy: undefined};
  const local = require(localCfg) || {};
  // The installer writes a new local.js after this read. Left in the require
  // cache, the old file is what its later steps (schema, Sails config,
  // config/passport/jwt.js) would load in the same process.
  delete require.cache[require.resolve(localCfg)];
  return {
    pkiDir: local.custom ? local.custom.pkiDir : undefined,
    trustProxy: local.http ? local.http.trustProxy : undefined
  };
};

// The default PKI folder, <app>/pki, as config/custom.js.
const defaultPkiDir = (appPath) => path.join(appPath, 'pki');
// The folder the setup tools use: the local.js override, else the default.
const pkiDirFor = (appPath) => readOldLocal(appPath).pkiDir || defaultPkiDir(appPath);

// The framed block that shows a generated passphrase, once, on the terminal.
const printPassphrase = (words) => {
  const lines = [
    `Agent CA backup passphrase: ${words}.`,
    'Store it now in a password manager. fog-node does not keep it.',
    'Without it, a database backup cannot restore the agent CA.'
  ];
  const width = Math.max(...lines.map((l) => l.length));
  const rule = `+${'-'.repeat(width + 2)}+`;
  console.log(rule);
  for (const line of lines) console.log(`| ${line.padEnd(width)} |`);
  console.log(rule);
};

// The first line of a passphrase file, normalized. The caller checks it where a new backup is sealed.
const readPassphraseFile = (file) => escrow.normalize(fs.readFileSync(file, 'utf8').split(/\r?\n/)[0]);

module.exports = {
  setupPki, isRootError, readOldLocal, defaultPkiDir, pkiDirFor, printPassphrase, readPassphraseFile, INTERACTIVE_TRIES,
  // For tools/setup/agent-ca-lib.js.
  saveBackup, restoreBackup, findEscrow, settingValue, writeSetting, fingerprintIn
};
