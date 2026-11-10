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
 *   server.key, server.pem           the certificate of the agent listener
 *                                    (api/hooks/agent-tls), issued by the root
 * The folder is made with mode 0o700 and each key file ends at 0o600, also
 * when it overwrites an older file. Windows ignores these modes.
 *
 * This is a plain module, not a Sails helper. The setup tools
 * (tools/setup/pki.js, ensurePki) and the agent-tls hook (ensureServerCert, at
 * lift) both use it, so it lives in api/lib and not in tools/.
 *
 * Certificates use @peculiar/x509 (it also builds and verifies CSRs). It signs
 * through WebCrypto, where an imported RSA key carries its hash. So each key
 * is imported with the hash of the certificate it signs: SHA-512 for the root
 * and the agent CA (makeRoot, makeAgentCa), SHA-256 for the server certificate
 * (makeServer imports the root key with SHA-256).
 * The shared crypto pieces are in api/lib/agent-pki.js.
 */
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const x509 = require('@peculiar/x509');
const shared = require('./agent-pki');

const DAYS = 10950;
// The server certificate of the agent listener: 825 days, and it is made again
// when fewer than 30 days remain.
const SERVER_DAYS = 825;
const SERVER_RENEW_DAYS = 30;
const SERVER_AUTH = '1.3.6.1.5.5.7.3.1';

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

// The names the server certificate must carry when no list is configured:
// localhost, this host's name, and every non-internal interface address. The
// agent pins the root and Go checks the URL host against these (contract 4.4).
const defaultSans = () => {
  const out = ['localhost', '127.0.0.1', os.hostname()];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const entry of list || []) {
      if (!entry.internal) out.push(entry.address);
    }
  }
  return out;
};

// The form in which two SAN entries compare equal: a name lower-cased, an IP
// address in its canonical spelling (the URL parser compresses an IPv6 address
// the same way for any input spelling). The type prefix keeps a name apart.
const sanKey = (value) => {
  const text = String(value).trim().toLowerCase().split('%')[0];
  return net.isIP(text) === 6 ? `ip:${new URL(`http://[${text}]`).hostname}` : `${net.isIP(text) ? 'ip' : 'dns'}:${text}`;
};

// A SAN list without empty entries or repeats. The first spelling stays.
const cleanSans = (list) => {
  const seen = new Set();
  return list.map((v) => String(v).trim()).filter((v) => {
    if (!v || seen.has(sanKey(v))) return false;
    seen.add(sanKey(v));
    return true;
  });
};

// The SAN entries of a certificate, as a sorted list of sanKey values.
const sanKeysOf = (certPem) => {
  const san = new x509.X509Certificate(certPem).getExtension(x509.SubjectAlternativeNameExtension);
  return (san ? san.names.items : []).map((n) => sanKey(n.value)).sort();
};

// The server certificate: RSA 2048, signed directly by the root (no
// intermediate). The subject CN is the first SAN.
const makeServer = async (rootKeyPem, rootCertPem, sans) => {
  const key = crypto.generateKeyPairSync('rsa', {modulusLength: 2048}).privateKey;
  const keys = await shared.importPair(key, 'SHA-256');
  const rootKeys = await shared.importPair(crypto.createPrivateKey(rootKeyPem), 'SHA-256');
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: shared.randomSerial(),
    subject: new x509.Name([{CN: [sans[0]]}, {O: ['FOG Project']}]),
    issuer: new x509.X509Certificate(rootCertPem).subjectName,
    notBefore: new Date(),
    notAfter: new Date(Date.now() + SERVER_DAYS * shared.DAY_MS),
    signingAlgorithm: shared.RSA,
    publicKey: keys.publicKey,
    signingKey: rootKeys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment, true),
      new x509.ExtendedKeyUsageExtension([SERVER_AUTH], false),
      // An IP address is an iPAddress entry and a name a dNSName entry. For an IP
      // host, Go checks only the IP entries.
      new x509.SubjectAlternativeNameExtension(sans.map((value) => ({type: net.isIP(value) ? 'ip' : 'dns', value})))
    ]
  });
  return {key: keyPem(key), cert: cert.toString('pem')};
};

// Must the server certificate be made again? It must when a file is missing,
// the SAN set differs from `wanted` (a list of sanKey values), fewer than
// SERVER_RENEW_DAYS remain, or the root no longer verifies it (a new root).
const serverStale = (certFile, keyFile, rootPem, wantedKeys) => {
  if (!exists(certFile) || !exists(keyFile)) return true;
  try {
    const pem = fs.readFileSync(certFile, 'utf8');
    if (JSON.stringify(sanKeysOf(pem)) !== JSON.stringify(wantedKeys)) return true;
    if (Date.parse(new crypto.X509Certificate(pem).validTo) - Date.now() < SERVER_RENEW_DAYS * shared.DAY_MS) return true;
    return !shared.verifies(pem, rootPem);
  } catch (unused) {
    return true;
  }
};

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

const {fingerprintOf} = shared;

// An error that the setup tools recognize by its code.
const rootError = (code, message) => Object.assign(new Error(message), {code});
// Is it one of the two guard errors? The tools print its message and stop.
const isRootError = (err) => Boolean(err) && (err.code === 'E_AGENT_ROOT_MISSING' || err.code === 'E_AGENT_ROOT_MISMATCH');

// The SAN list of opts.sans, or the default list when it is unset or empty.
const sansOf = (opts) => cleanSans(opts.sans && opts.sans.length ? opts.sans : defaultSans());

// The server certificate step of ensurePki and ensureServerCert: the rules of
// the server.pem item of ensurePki below.
const ensureServer = async (dir, rootPem, sans) => {
  const f = (name) => path.join(dir, name);
  if (serverStale(f('server.pem'), f('server.key'), rootPem, sans.map(sanKey).sort())) {
    if (!exists(f('root.key'))) {
      throw new Error(`${f('server.pem')} is missing or out of date, and ${f('root.key')} is missing, so the server certificate cannot be made.`);
    }
    const suffix = stamp();
    for (const name of ['server.pem', 'server.key']) {
      if (exists(f(name))) fs.renameSync(f(name), f(`${name}.${suffix}`));
    }
    const server = await makeServer(fs.readFileSync(f('root.key'), 'utf8'), rootPem, sans);
    writeKey(f('server.key'), server.key);
    writeCert(f('server.pem'), server.cert);
  }
};

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
 * - server.pem and server.key (the agent listener) are made when missing. They
 *   are made again, the old pair renamed with a timestamp, when the SAN set
 *   differs from opts.sans, fewer than 30 days remain, or the root no longer
 *   verifies the certificate. Names compare in lower case and IP addresses in
 *   canonical form, in any order. Without opts.sans the default list applies
 *   (defaultSans). A re-issue with root.key missing throws.
 * - opts.expectedRoot (a fingerprint256 string) guards the root. A missing
 *   root.pem throws E_AGENT_ROOT_MISSING, and a root.pem with another
 *   fingerprint throws E_AGENT_ROOT_MISMATCH. Both throw before any file is
 *   written. Without it, the rules above apply unchanged.
 * Returns {rootFingerprint}, the fingerprint of root.pem after the call.
 */
const ensurePki = async (dir, opts = {}) => {
  const {expectedRoot} = opts;
  const sans = sansOf(opts);
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

  await ensureServer(dir, rootPem, sans);
  return {rootFingerprint: fingerprintOf(rootPem)};
};

/**
 * The lift-time step of the agent-tls hook: server.pem and server.key only,
 * under the ensurePki rules (made when missing; made again, the old pair
 * renamed, when the SAN set differs from opts.sans, fewer than 30 days remain,
 * or the root no longer verifies it). It never makes or renames a root or an
 * agent CA: a new agent CA orphans every enrolled agent, so only setup makes
 * one. When root.pem or agent-ca.pem is missing, or root.pem does not verify
 * agent-ca.pem, it throws E_AGENT_PKI_MISSING before any file is written.
 */
const ensureServerCert = async (dir, opts = {}) => {
  const sans = sansOf(opts);
  const f = (name) => path.join(dir, name);
  const rootPem = exists(f('root.pem')) ? fs.readFileSync(f('root.pem'), 'utf8') : '';
  if (!rootPem || !exists(f('agent-ca.pem')) || !shared.verifies(fs.readFileSync(f('agent-ca.pem'), 'utf8'), rootPem)) {
    throw rootError('E_AGENT_PKI_MISSING', `The agent root ${f('root.pem')} or the agent CA ${f('agent-ca.pem')} is missing, or the root does not verify the agent CA.`);
  }
  await ensureServer(dir, rootPem, sans);
};

module.exports = {ensurePki, ensureServerCert, defaultSans, cleanSans, rootError, isRootError, stamp, exists};
