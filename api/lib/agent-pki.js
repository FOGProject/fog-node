/**
 * The crypto pieces that the agent PKI shares: tools/setup/pki.js (makes the
 * CAs) and api/helpers/agent/* (sign a CSR, fingerprint a key) both use them.
 * This is a plain module, not a Sails helper. Sails does not autoload api/lib.
 *
 * Certificates use @peculiar/x509. It signs through WebCrypto, where an
 * imported RSA key carries its hash (see importPair).
 */
const crypto = require('crypto');
const x509 = require('@peculiar/x509');

const DAY_MS = 24 * 60 * 60 * 1000;
const CLIENT_AUTH = '1.3.6.1.5.5.7.3.2';
const RSA = {name: 'RSASSA-PKCS1-v1_5'};
const CSR_HEADER = '-----BEGIN CERTIFICATE REQUEST-----';

// Does the text carry the CSR header? (The 1.6 check, Enrollment.php:304.)
const isCsrPem = (text) => String(text).includes(CSR_HEADER);

// Hex serial: 16 random bytes, never zero, top bit clear so it stays positive.
const randomSerial = () => {
  const bytes = crypto.randomBytes(16);
  bytes[0] = (bytes[0] & 0x7f) || 1;
  return bytes.toString('hex');
};

// The subject is built from typed parts, so no text can add a name component.
const subjectOf = (cn, ou) => new x509.Name([{CN: [cn]}, {O: ['FOG Project']}, {OU: [ou]}]);

// Import the key pair of a Node RSA key object for WebCrypto with one hash.
const importPair = async (privateKey, hash) => {
  const alg = {name: RSA.name, hash};
  const publicKey = crypto.createPublicKey(privateKey);
  return {
    privateKey: await crypto.webcrypto.subtle.importKey('pkcs8', privateKey.export({type: 'pkcs8', format: 'der'}), alg, false, ['sign']),
    publicKey: await crypto.webcrypto.subtle.importKey('spki', publicKey.export({type: 'spki', format: 'der'}), alg, true, ['verify'])
  };
};

/**
 * Does `certPem` verify as issued by `issuerPem`? "Verifies" is Node's own
 * X509Certificate: it asks whether the certificate was issued by the issuer,
 * and checks the signature. For a leaf (`leaf` true) it also needs the
 * clientAuth extended key usage and `ca` false. Any parse error is false.
 */
const verifies = (certPem, issuerPem, leaf) => {
  try {
    const cert = new crypto.X509Certificate(certPem);
    const issuer = new crypto.X509Certificate(issuerPem);
    if (!cert.checkIssued(issuer) || !cert.verify(issuer.publicKey)) return false;
    if (leaf && (cert.ca || !(cert.keyUsage || []).includes(CLIENT_AUTH))) return false;
    return true;
  } catch (unused) {
    return false;
  }
};

// The Setting that records the root CA that enrolled fog-agents pin.
const ROOT_SETTING = 'FOG_AGENT_ROOT_FINGERPRINT';
const ROOT_SETTING_DESCRIPTION = 'The SHA-256 fingerprint of the root CA that enrolled fog-agents pin. Setup refuses another root while this is set.';

// The fingerprint of a certificate, as Node prints it (colon hex, upper case).
const fingerprintOf = (pem) => new crypto.X509Certificate(pem).fingerprint256;

// The agent leaf CN, "fog-agent host <id>" (contract 4.2). signCsr writes it and
// leafInfo reads it back, so the text lives here once.
const AGENT_CN_PREFIX = 'fog-agent host ';
const agentCn = (hostId) => `${AGENT_CN_PREFIX}${hostId}`;
const AGENT_CN_RX = new RegExp(`^CN=${AGENT_CN_PREFIX}(\\d+)$`, 'm');

// A date as UTC "YYYY-MM-DD HH:MM:SS", the 1.6 format of not_after.
const utc = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

// The host number and expiry of an agent leaf. `agentId` is null when the CN
// is not an agent CN. `notAfter` is in the utc format.
const leafInfo = (pem) => {
  const leaf = new crypto.X509Certificate(pem);
  const cn = AGENT_CN_RX.exec(leaf.subject);
  return {
    agentId: cn ? Number(cn[1]) : null,
    notAfter: utc(new Date(Date.parse(leaf.validTo)))
  };
};

// The JSON body of an agent request as an object, or {} for anything else.
const jsonBody = (req) => ((req.body && typeof req.body === 'object' && !Array.isArray(req.body)) ? req.body : {});

// The agent request fields that enroll, renew and poll share.
// A CSR is about 500 characters (ECDSA P-256) and an RSA-4096 CSR about 1800.
// 16384 leaves room for any real key, and stops a caller from making a route
// parse and store a huge value.
const MAX_CSR = 16384;

// The field limits of the 1.6 columns, so a caller cannot store more.
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

// Update::normalize: trim, and strip one leading v or V.
const version = (value) => {
  const v = text(value, 50).trim();
  return /^[vV]/.test(v) ? v.slice(1) : v;
};

module.exports = {DAY_MS, CLIENT_AUTH, RSA, ROOT_SETTING, ROOT_SETTING_DESCRIPTION, MAX_CSR, fingerprintOf, isCsrPem, randomSerial, subjectOf, importPair, verifies, agentCn, leafInfo, jsonBody, text, version};
