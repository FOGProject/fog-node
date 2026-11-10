/**
 * The logic of `npm run agent-ca` (tools/setup/agent-ca.js): back up the agent
 * CA to the database, restore it from there, and show the backup status.
 * Each function takes {pkiDir, settings, escrows}, with the Setting and
 * AgentCaEscrow models passed in as setupPki takes them, so the mocha suite
 * runs them on the test database. backup also takes the passphrase; restore
 * takes getPassphrase and tries, as pki.restoreBackup does; status takes
 * neither. A refusal throws an error with the message to print. The passphrase is never printed or stored here. The
 * seal and the restore themselves are shared with setup (tools/setup/pki.js).
 */
const fs = require('fs');
const path = require('path');
const shared = require('../../api/lib/agent-pki');
const {exists} = require('../../api/lib/agent-pki-files');
const escrow = require('../../api/lib/agent-ca-escrow');
const pki = require('./pki');

const {ROOT_SETTING, AGENT_CA_SETTING, AGENT_CA_SETTING_DESCRIPTION} = shared;

const refusal = (message) => Object.assign(new Error(message), {code: 'E_AGENT_CA'});

/**
 * Seal the four CA files of pkiDir under the passphrase, and replace any
 * backup. It refuses when root.pem is missing or is not the recorded root, or
 * agent-ca.pem is not the recorded agent CA. An unset agent CA Setting is
 * written first when agent-ca.pem verifies against the recorded root.
 */
const backup = async ({pkiDir, settings, escrows, passphrase}) => {
  escrow.checkPassphrase(passphrase);
  const recordedRoot = await pki.settingValue(settings, ROOT_SETTING);
  const notRecorded = refusal('pki/ does not hold the recorded CA.');
  if (!recordedRoot || !exists(path.join(pkiDir, 'root.pem')) || !exists(path.join(pkiDir, 'agent-ca.pem'))) throw notRecorded;
  if (pki.fingerprintIn(pkiDir, 'root.pem') !== recordedRoot) throw notRecorded;
  const agentCaFingerprint = pki.fingerprintIn(pkiDir, 'agent-ca.pem');
  let recordedCa = await pki.settingValue(settings, AGENT_CA_SETTING);
  // An install from before the Setting existed: record the agent CA that the root issued.
  const read = (name) => fs.readFileSync(path.join(pkiDir, name), 'utf8');
  if (!recordedCa && shared.verifies(read('agent-ca.pem'), read('root.pem'))) {
    recordedCa = agentCaFingerprint;
    await pki.writeSetting(settings, AGENT_CA_SETTING, AGENT_CA_SETTING_DESCRIPTION, recordedCa);
  }
  if (agentCaFingerprint !== recordedCa) throw notRecorded;
  await pki.saveBackup({pkiDir, escrows, passphrase, rootFingerprint: recordedRoot});
  return {rootFingerprint: recordedRoot, agentCaFingerprint};
};

/**
 * Restore the four CA files from the backup into an empty pkiDir, then make
 * the bundle and the server certificate (pki.restoreBackup). Every refusal
 * comes before getPassphrase({purpose: 'restore'}) is asked, up to `tries`
 * times. Each wrong passphrase writes one denied audit row; after the last it
 * throws E_ESCROW_PASSPHRASE. No file is written before a passphrase opens.
 */
const restore = async ({pkiDir, settings, escrows, getPassphrase, tries = 1, log}) => {
  // This refusal and its message come first, before any other check or prompt.
  // Kept on purpose: it repeats restoreBackup's E_ESCROW_FILES check so the CLI
  // refuses before the backup and Setting checks.
  if (escrow.CA_FILES.some((name) => exists(path.join(pkiDir, name)))) {
    throw refusal(`${pkiDir} already holds CA files; move them away first.`);
  }
  return pki.restoreBackup({pkiDir, settings, escrows, sans: sails.config.custom.agentTlsSans, getPassphrase, tries, log});
};

/**
 * Whether a backup exists, and whether each of its two fingerprints equals
 * the recorded one and the file on disk. Returns the facts and the lines to
 * print. It never asks for or prints a passphrase.
 */
const status = async ({pkiDir, settings, escrows}) => {
  const record = await pki.findEscrow(escrows);
  if (!record) return {exists: false, lines: ['No agent CA backup is in the database.']};
  const onDisk = (name) => (exists(path.join(pkiDir, name)) ? pki.fingerprintIn(pkiDir, name) : undefined);
  const facts = {
    exists: true,
    root: {
      recorded: record.rootFingerprint === await pki.settingValue(settings, ROOT_SETTING),
      onDisk: record.rootFingerprint === onDisk('root.pem')
    },
    agentCa: {
      recorded: record.agentCaFingerprint === await pki.settingValue(settings, AGENT_CA_SETTING),
      onDisk: record.agentCaFingerprint === onDisk('agent-ca.pem')
    }
  };
  const yesNo = (v) => (v ? 'yes' : 'no');
  facts.lines = [
    'An agent CA backup is in the database.',
    `Root ${record.rootFingerprint}: equals the recorded root: ${yesNo(facts.root.recorded)}; equals ${path.join(pkiDir, 'root.pem')}: ${yesNo(facts.root.onDisk)}.`,
    `Agent CA ${record.agentCaFingerprint}: equals the recorded agent CA: ${yesNo(facts.agentCa.recorded)}; equals ${path.join(pkiDir, 'agent-ca.pem')}: ${yesNo(facts.agentCa.onDisk)}.`
  ];
  return facts;
};

module.exports = {backup, restore, status};
