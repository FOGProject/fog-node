/**
 * The key fingerprint of fog-agent enrollment: the lowercase hex sha256 of the
 * public key's PEM text ("-----BEGIN PUBLIC KEY-----" ... "-----END PUBLIC
 * KEY-----\n"). It is not the hash of the DER bytes. FOG 1.6 and the agent
 * both hash the PEM text (contract section 0, item 1), so the same key gives
 * the same value on both servers.
 *
 * Input: a CSR PEM or a certificate PEM.
 * Exit invalid: the text is neither.
 *
 * Usage: let fp = sails.helpers.agent.keyFingerprint(pem)  (sync)
 */
const crypto = require('crypto');
const x509 = require('@peculiar/x509');
const pki = require('../../lib/agent-pki');

module.exports = {
  friendlyName: 'Key fingerprint',
  description: 'Hash the public key PEM of a CSR or certificate with sha256.',
  sync: true,
  inputs: {
    pem: {type: 'string', required: true, description: 'A CSR or a certificate, PEM text.'}
  },
  exits: {
    success: {outputType: 'string', description: 'Lowercase hex sha256.'},
    invalid: {description: 'The text is not a CSR or a certificate.'}
  },
  fn: function ({pem}, exits) {
    let publicKey;
    try {
      if (pki.isCsrPem(pem)) {
        // Node has no CSR parser. The SPKI bytes come from @peculiar/x509.
        publicKey = crypto.createPublicKey({
          key: Buffer.from(new x509.Pkcs10CertificateRequest(pem).publicKey.rawData),
          format: 'der',
          type: 'spki'
        });
      } else {
        publicKey = new crypto.X509Certificate(pem).publicKey;
      }
    } catch (unused) {
      return exits.invalid();
    }
    return exits.success(crypto.createHash('sha256')
      .update(publicKey.export({type: 'spki', format: 'pem'})).digest('hex'));
  }
};
