/**
 * AgentCaEscrow.js
 *
 * The backup of the fog-agent CA keys: one record that holds root.key,
 * root.pem, agent-ca.key and agent-ca.pem, sealed under a passphrase
 * (scrypt plus AES-256-GCM, api/lib/agent-ca-escrow.js). With a database
 * backup and the passphrase, setup restores a lost PKI folder.
 *
 * Not generic CRUD: config/permissions.js has no stock entry for it, so
 * GET /api/v1/agentcaescrow answers 403. No route or page returns the record.
 */
module.exports = {
  attributes: {
    // The record format. 1 is the only one.
    version: {
      type: 'number'
    },
    // The fingerprints of root.pem and agent-ca.pem (fingerprintOf format).
    // They are in the clear, and the AAD binds them to the ciphertext.
    rootFingerprint: {
      type: 'string'
    },
    agentCaFingerprint: {
      type: 'string'
    },
    // {name: 'scrypt', N, r, p, salt}. salt is base64 of 16 random bytes.
    kdf: {
      type: 'json'
    },
    // base64: the 12-byte AES-GCM iv (new on each seal) and the 16-byte tag.
    iv: {
      type: 'string'
    },
    tag: {
      type: 'string'
    },
    // base64 of the encrypted JSON of the four PEM texts.
    ciphertext: {
      type: 'string'
    }
  }
};
