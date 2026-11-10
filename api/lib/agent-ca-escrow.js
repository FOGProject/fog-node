/**
 * The backup of the fog-agent CA keys, sealed under a passphrase. The record
 * (api/models/AgentCaEscrow.js) holds the four CA files of the PKI folder:
 * root.key, root.pem, agent-ca.key and agent-ca.pem. With a database backup
 * and the passphrase, setup restores a lost PKI folder. server.key and
 * server.pem are not in it, because ensurePki re-makes them from the root.
 *
 * The key is scrypt of the passphrase (N 131072, r 8, p 1), so each guess
 * is expensive. The cipher is AES-256-GCM. The AAD names both fingerprints,
 * so a record whose clear fingerprints were edited does not decrypt. Node's
 * encrypted-PEM export (PKCS#8 with PBKDF2 defaults) is not used: its guesses
 * are cheap.
 *
 * The passphrase is never stored, logged or written to a file here.
 *
 * This is a plain module, not a Sails helper, like api/lib/agent-pki-files.js.
 *
 * The wordlist eff_large_wordlist.txt is vendored byte for byte from
 *   https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt
 *   SHA-256 addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e
 * License: CC BY 3.0 US, Electronic Frontier Foundation.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {fingerprintOf} = require('./agent-pki');
const {exists, writeKey, writeCert} = require('./agent-pki-files');

const KDF_DEFAULTS = {N: 131072, r: 8, p: 1};
const VERSION = 1;
const MIN_LENGTH = 20;
const WORDS = 6;
// N 131072 with r 8 needs 128 MiB. Node's default limit is 32 MiB.
const MAXMEM = 256 * 1024 * 1024;
const CA_FILES = ['root.key', 'root.pem', 'agent-ca.key', 'agent-ca.pem'];

// Each line is "<5 digits>\t<word>". Checked at load: 7776 unique words.
const WORDLIST = fs.readFileSync(path.join(__dirname, 'eff_large_wordlist.txt'), 'utf8')
  .split('\n').filter((line) => line.length).map((line) => line.split('\t')[1]);
if (WORDLIST.length !== 7776 || new Set(WORDLIST).size !== 7776) {
  throw new Error('api/lib/eff_large_wordlist.txt does not hold 7776 unique words.');
}

// An error that the setup tools recognize by its code (also tools/setup/pki.js).
const escrowError = (code, message) => Object.assign(new Error(message), {code});
const recordError = () => escrowError('E_ESCROW_RECORD', 'The agent CA backup record is not valid.');
const passphraseError = () => escrowError('E_ESCROW_PASSPHRASE', 'The passphrase does not open the agent CA backup.');

// NFC, trimmed, and each run of whitespace inside made one space. Case is kept.
const normalize = (text) => String(text).normalize('NFC').trim().replace(/\s+/g, ' ');

// 6 list words joined by one space. A space, not '-': the list holds drop-down,
// felt-tip, t-shirt and yo-yo.
const generatePassphrase = () => {
  const words = [];
  for (let i = 0; i < WORDS; i++) words.push(WORDLIST[crypto.randomInt(WORDLIST.length)]);
  return words.join(' ');
};

// A supplied passphrase needs 20 normalized characters. No composition rule
// (NIST SP 800-63B).
const checkPassphrase = (text) => {
  if (normalize(text).length < MIN_LENGTH) {
    throw escrowError('E_ESCROW_WEAK', `The agent CA backup passphrase must be at least ${MIN_LENGTH} characters.`);
  }
};

const aadOf = (rootFingerprint, agentCaFingerprint) =>
  Buffer.from(`fog-agent-ca-escrow:v1:${rootFingerprint}:${agentCaFingerprint}`, 'utf8');

const deriveKey = (passphrase, salt, {N, r, p}) => new Promise((resolve, reject) => {
  crypto.scrypt(normalize(passphrase), salt, 32, {N, r, p, maxmem: MAXMEM}, (err, key) => (err ? reject(err) : resolve(key)));
});

/**
 * Seal the four CA files of pkiDir under the passphrase. Returns the record
 * attributes: version 1, both fingerprints, a new salt and iv. `kdf` exists
 * for the tests; the setup tools pass nothing.
 */
const seal = async (pkiDir, passphrase, kdf = KDF_DEFAULTS) => {
  const read = (name) => fs.readFileSync(path.join(pkiDir, name), 'utf8');
  const texts = {rootKey: read('root.key'), rootCert: read('root.pem'), agentCaKey: read('agent-ca.key'), agentCaCert: read('agent-ca.pem')};
  const rootFingerprint = fingerprintOf(texts.rootCert);
  const agentCaFingerprint = fingerprintOf(texts.agentCaCert);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await deriveKey(passphrase, salt, kdf);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {authTagLength: 16});
  cipher.setAAD(aadOf(rootFingerprint, agentCaFingerprint));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(texts), 'utf8'), cipher.final()]);
  return {
    version: VERSION,
    rootFingerprint,
    agentCaFingerprint,
    kdf: {name: 'scrypt', N: kdf.N, r: kdf.r, p: kdf.p, salt: salt.toString('base64')},
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
};

// N must be a power of two from 1024 to 131072.
const validN = (n) => Number.isInteger(n) && n >= 1024 && n <= KDF_DEFAULTS.N && (n & (n - 1)) === 0;

/**
 * Open a record with the passphrase. Returns {rootKey, rootCert, agentCaKey,
 * agentCaCert}, the four PEM texts. A record of another shape throws
 * E_ESCROW_RECORD. A wrong passphrase, or a changed byte anywhere the key or
 * the AAD covers, throws E_ESCROW_PASSPHRASE.
 */
const open = async (record, passphrase) => {
  const kdf = record && record.kdf;
  if (!record || record.version !== VERSION || !kdf || kdf.name !== 'scrypt' ||
      !validN(kdf.N) || kdf.r !== 8 || kdf.p !== 1 || typeof kdf.salt !== 'string') {
    throw recordError();
  }
  const iv = Buffer.from(String(record.iv), 'base64');
  const tag = Buffer.from(String(record.tag), 'base64');
  if (iv.length !== 12 || tag.length !== 16) throw recordError();
  const key = await deriveKey(passphrase, Buffer.from(kdf.salt, 'base64'), kdf);
  let texts;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, {authTagLength: 16});
    decipher.setAAD(aadOf(record.rootFingerprint, record.agentCaFingerprint));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(Buffer.from(String(record.ciphertext), 'base64')), decipher.final()]);
    texts = JSON.parse(plain.toString('utf8'));
  } catch (unused) {
    throw passphraseError();
  }
  // The AAD already binds the fingerprints. This checks the certificates themselves.
  if (fingerprintOf(texts.rootCert) !== record.rootFingerprint || fingerprintOf(texts.agentCaCert) !== record.agentCaFingerprint) {
    throw recordError();
  }
  return {rootKey: texts.rootKey, rootCert: texts.rootCert, agentCaKey: texts.agentCaKey, agentCaCert: texts.agentCaCert};
};

/**
 * Write the four CA files of an opened record to pkiDir (mode 0o700). The keys
 * end at 0600 (writeKey). It throws before any write when one of the four
 * files exists; the callers check first.
 */
const restore = (pkiDir, texts) => {
  const f = (name) => path.join(pkiDir, name);
  const found = CA_FILES.filter((name) => exists(f(name)));
  if (found.length) throw new Error(`${pkiDir} already holds ${found.join(', ')}.`);
  fs.mkdirSync(pkiDir, {recursive: true, mode: 0o700});
  writeKey(f('root.key'), texts.rootKey);
  writeCert(f('root.pem'), texts.rootCert);
  writeKey(f('agent-ca.key'), texts.agentCaKey);
  writeCert(f('agent-ca.pem'), texts.agentCaCert);
};

module.exports = {KDF_DEFAULTS, CA_FILES, escrowError, normalize, generatePassphrase, checkPassphrase, seal, open, restore};
