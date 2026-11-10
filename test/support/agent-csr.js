const crypto = require('crypto');
const x509 = require('@peculiar/x509');

// A CSR as the fog-agent builds it: an ECDSA P-256 key and an empty subject
// (contract 4.3). Returns {pem, fingerprint, keys}. `fingerprint` is the key
// fingerprint that the enroll row is keyed by. Needs the lifted sails global.
const newKey = () => crypto.webcrypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);

const csrFor = async (keys) => {
  const csr = await x509.Pkcs10CertificateRequestGenerator.create({
    name: '', keys, signingAlgorithm: {name: 'ECDSA', hash: 'SHA-256'}
  });
  const pem = csr.toString('pem');
  return {pem, fingerprint: sails.helpers.agent.keyFingerprint(pem), keys};
};

const newCsr = async () => csrFor(await newKey());

// The same CSR with its last signature byte changed: it parses, but the
// self-signature does not verify.
const forge = (pem) => {
  const der = Buffer.from(pem.replace(/-----[A-Z ]+-----|\s/g, ''), 'base64');
  der[der.length - 1] ^= 0x01;
  return `-----BEGIN CERTIFICATE REQUEST-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE REQUEST-----\n`;
};

module.exports = {newKey, csrFor, newCsr, forge};
