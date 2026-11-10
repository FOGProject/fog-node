/**
 * The fog-agent certificate authorities: a root ("FOG Server CA") and the
 * agent intermediate ("FOG Agent CA") that signs the agent client certificates.
 * The parameters match FOG 1.6 (lib/common/functions.sh), so one agent binary
 * works against 1.6 and fog-node.
 *
 * Files in the PKI folder (custom.pkiDir):
 *   root.key, root.pem               the root CA
 *   agent-ca.key, agent-ca.pem       the agent CA, issued by the root
 *   agent-ca-bundle.pem              agent CA, then root
 * The folder is made with mode 0o700 and each key file ends at 0o600, also
 * when it overwrites an older file. Windows ignores these modes.
 *
 * Certificates use @peculiar/x509 (it also builds and verifies CSRs). It signs
 * through WebCrypto, where an imported RSA key carries its hash. So the root
 * key is imported with SHA-512 and the agent CA key with SHA-256.
 * The shared crypto pieces are in api/lib/agent-pki.js.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const x509 = require('@peculiar/x509');
const shared = require('../../api/lib/agent-pki');

const DAYS = 10950;

const newKey = () => crypto.generateKeyPairSync('rsa', {modulusLength: 4096}).privateKey;
const keyPem = (key) => key.export({type: 'pkcs8', format: 'pem'});

const makeRoot = async () => {
  const key = newKey();
  const keys = await shared.importPair(key, 'SHA-512');
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: shared.randomSerial(),
    name: shared.subjectOf('FOG Server CA', 'FOG Root CA'),
    notBefore: new Date(),
    notAfter: new Date(Date.now() + DAYS * shared.DAY_MS),
    signingAlgorithm: shared.RSA,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(true, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
    ]
  });
  return {key: keyPem(key), cert: cert.toString('pem')};
};

const makeAgentCa = async (rootKeyPem, rootCertPem) => {
  const key = newKey();
  const keys = await shared.importPair(key, 'SHA-512');
  // The root key signs this certificate, so it is imported with SHA-512.
  const rootKeys = await shared.importPair(crypto.createPrivateKey(rootKeyPem), 'SHA-512');
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: shared.randomSerial(),
    subject: shared.subjectOf('FOG Agent CA', 'FOG Agent'),
    issuer: new x509.X509Certificate(rootCertPem).subjectName,
    notBefore: new Date(),
    notAfter: new Date(Date.now() + DAYS * shared.DAY_MS),
    signingAlgorithm: shared.RSA,
    publicKey: keys.publicKey,
    signingKey: rootKeys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
      new x509.ExtendedKeyUsageExtension([shared.CLIENT_AUTH], false)
    ]
  });
  return {key: keyPem(key), cert: cert.toString('pem')};
};

const exists = (file) => fs.existsSync(file);
// The mode option applies only to a new file, so chmod makes an overwritten key 0600 too.
// Windows has no POSIX modes: there chmod may fail, and that is fine.
const writeKey = (file, pem) => {
  fs.writeFileSync(file, pem, {mode: 0o600});
  try {
    fs.chmodSync(file, 0o600);
  } catch (err) {
    if (process.platform !== 'win32') throw err;
  }
};
// toString('pem') has no final newline. Without it the bundle would run the
// agent CA's END line into the root's BEGIN line.
const writeCert = (file, pem) => fs.writeFileSync(file, pem.endsWith('\n') ? pem : pem + '\n');

// UTC YYYYMMDDHHMMSS: the suffix of a file that a new one replaces.
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

const {fingerprintOf, ROOT_SETTING, ROOT_SETTING_DESCRIPTION} = shared;

// An error that the setup tools recognize by its code.
const rootError = (code, message) => Object.assign(new Error(message), {code});
// Is it one of the two guard errors? The tools print its message and stop.
const isRootError = (err) => Boolean(err) && (err.code === 'E_AGENT_ROOT_MISSING' || err.code === 'E_AGENT_ROOT_MISMATCH');

/**
 * Make the CA files that are missing. As 1.6: a certificate file is what
 * "exists" means.
 * - root.pem missing: make root.key and root.pem. An existing root.key is
 *   renamed with a timestamp first. An existing root.pem is never re-made,
 *   even when root.key is missing.
 * - agent-ca.pem missing, or not verifying against root.pem: re-mint the agent
 *   CA with root.key. The old agent-ca.pem and agent-ca.key get a timestamp
 *   suffix first. A re-mint with root.key missing throws.
 * - agent-ca-bundle.pem is brought up to date on every call. It is written
 *   only when its text differs, so a second call changes no file.
 * - opts.expectedRoot (a fingerprint256 string) guards the root. A missing
 *   root.pem throws E_AGENT_ROOT_MISSING, and a root.pem with another
 *   fingerprint throws E_AGENT_ROOT_MISMATCH. Both throw before any file is
 *   written. Without it, the rules above apply unchanged.
 * Returns {rootFingerprint}, the fingerprint of root.pem after the call.
 */
const ensurePki = async (dir, opts = {}) => {
  const {expectedRoot} = opts;
  const f = (name) => path.join(dir, name);
  if (expectedRoot) {
    if (!exists(f('root.pem'))) {
      throw rootError('E_AGENT_ROOT_MISSING', `The agent root ${f('root.pem')} is missing, but the database records the root ${expectedRoot}.`);
    }
    const onDisk = fingerprintOf(fs.readFileSync(f('root.pem'), 'utf8'));
    if (onDisk !== expectedRoot) {
      throw rootError('E_AGENT_ROOT_MISMATCH', `The agent root ${f('root.pem')} has the fingerprint ${onDisk}, but the database records the root ${expectedRoot}.`);
    }
  }
  fs.mkdirSync(dir, {recursive: true, mode: 0o700});

  if (!exists(f('root.pem'))) {
    if (exists(f('root.key'))) fs.renameSync(f('root.key'), f(`root.key.${stamp()}`));
    const root = await makeRoot();
    writeKey(f('root.key'), root.key);
    writeCert(f('root.pem'), root.cert);
  }
  const rootPem = fs.readFileSync(f('root.pem'), 'utf8');

  if (!exists(f('agent-ca.pem')) || !shared.verifies(fs.readFileSync(f('agent-ca.pem'), 'utf8'), rootPem)) {
    if (!exists(f('root.key'))) {
      throw new Error(`${f('agent-ca.pem')} is missing or not issued by ${f('root.pem')}, and ${f('root.key')} is missing, so the agent CA cannot be re-made.`);
    }
    const suffix = stamp();
    for (const name of ['agent-ca.pem', 'agent-ca.key']) {
      if (exists(f(name))) fs.renameSync(f(name), f(`${name}.${suffix}`));
    }
    const ca = await makeAgentCa(fs.readFileSync(f('root.key'), 'utf8'), rootPem);
    writeKey(f('agent-ca.key'), ca.key);
    writeCert(f('agent-ca.pem'), ca.cert);
  }

  // Both files end in a newline (writeCert), so the join is clean.
  const bundle = fs.readFileSync(f('agent-ca.pem'), 'utf8') + rootPem;
  if (!exists(f('agent-ca-bundle.pem')) || fs.readFileSync(f('agent-ca-bundle.pem'), 'utf8') !== bundle) {
    writeCert(f('agent-ca-bundle.pem'), bundle);
  }
  return {rootFingerprint: fingerprintOf(rootPem)};
};

/**
 * The setup step for the agent CAs. It records the root fingerprint in the
 * Setting ROOT_SETTING (api/lib/agent-pki.js) and refuses another root while it is set.
 * - settings: the Setting model. log: a function for the printed lines.
 * - newRoot: true after --new-agent-root. With a recorded root, the four CA
 *   files that exist get a timestamp suffix, so ensurePki makes new CAs.
 * - command: 'setup' or 'setup:dev', the npm script that the messages name.
 * Returns {rootFingerprint}. A refusal throws an error that keeps its code
 * (E_AGENT_ROOT_MISSING or E_AGENT_ROOT_MISMATCH) and has the full message.
 */
const setupPki = async ({pkiDir, newRoot, settings, log, command}) => {
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
    result = await ensurePki(pkiDir, {expectedRoot: replace ? undefined : recorded});
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

module.exports = {ensurePki, setupPki, isRootError, overrideDir, pkiDirFor};
