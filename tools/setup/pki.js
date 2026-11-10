/**
 * The setup step for the fog-agent certificate authorities. Making the CA and
 * server certificate files (ensurePki) is in api/lib/agent-pki-files.js,
 * because the agent-tls hook uses it at lift too. This file adds the root
 * guard, the Setting that records the root, and the pkiDir lookup.
 */
const fs = require('fs');
const path = require('path');
const shared = require('../../api/lib/agent-pki');
const files = require('../../api/lib/agent-pki-files');

const {ensurePki, isRootError, rootError, stamp, exists} = files;
const {ROOT_SETTING, ROOT_SETTING_DESCRIPTION} = shared;

/**
 * The setup step for the agent CAs. It records the root fingerprint in the
 * Setting ROOT_SETTING (api/lib/agent-pki.js) and refuses another root while it is set.
 * - settings: the Setting model. log: a function for the printed lines.
 * - newRoot: true after --new-agent-root. With a recorded root, the four CA
 *   files that exist get a timestamp suffix, so ensurePki makes new CAs.
 * - command: 'setup' or 'setup:dev', the npm script that the messages name.
 * - sans: the SAN list of the server certificate (ensurePki). Unset: the default list.
 * Returns {rootFingerprint}. A refusal throws an error that keeps its code
 * (E_AGENT_ROOT_MISSING or E_AGENT_ROOT_MISMATCH) and has the full message.
 */
const setupPki = async ({pkiDir, newRoot, settings, log, command, sans}) => {
  const record = await settings.findOne({name: ROOT_SETTING});
  const recorded = record ? record.value : undefined;
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
    throw rootError(err.code, `${err.message}\n` +
      `Restore the pki folder from your backup to ${pkiDir}, then run setup again.\n` +
      'To start over with a new root on purpose (every enrolled agent must then be re-enrolled by hand), ' +
      `run: npm run ${command} -- --new-agent-root`);
  }

  if (replace) log('A new agent root was made. Every enrolled fog-agent must be re-enrolled with the new ca.cert.pem.');

  if (record) {
    await settings.updateOne({name: ROOT_SETTING}).set({value: result.rootFingerprint});
  } else {
    await settings.create({name: ROOT_SETTING, description: ROOT_SETTING_DESCRIPTION, value: result.rootFingerprint});
  }
  return result;
};

/**
 * The custom.pkiDir that an existing config/local.js sets, or undefined.
 * The setup tools carry it into the local.js they write, so a re-run keeps it.
 */
const overrideDir = (appPath) => {
  const localCfg = path.join(appPath, 'config', 'local.js');
  if (!exists(localCfg)) return undefined;
  const local = require(localCfg);
  return local && local.custom && local.custom.pkiDir;
};

// The folder the setup tools use: the local.js override, else <app>/pki as config/custom.js.
const pkiDirFor = (appPath) => overrideDir(appPath) || path.join(appPath, 'pki');

module.exports = {setupPki, isRootError, overrideDir, pkiDirFor};
