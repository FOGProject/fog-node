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

module.exports = {DAY_MS, CLIENT_AUTH, RSA, ROOT_SETTING, ROOT_SETTING_DESCRIPTION, fingerprintOf, isCsrPem, randomSerial, subjectOf, importPair, verifies};
