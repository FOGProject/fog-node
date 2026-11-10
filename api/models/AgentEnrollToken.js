/**
 * AgentEnrollToken.js
 *
 * A fog-agent enrollment token (contract 2.2). Only the sha256 of the secret is
 * stored; the secret is shown once, at mint. An agent that sends a valid token
 * is issued a certificate at once (api/helpers/agent/auto-approve.js).
 *
 * Not generic CRUD: config/permissions.js has no stock entry for it.
 */
const crypto = require('crypto');

module.exports = {
  // The stored form of a token secret: the sha256 hex of the trimmed text.
  // The one place that trims, so mint and enroll agree (AgentEnrollToken.hashOf).
  hashOf: (token) => crypto.createHash('sha256').update(String(token).trim()).digest('hex'),
  attributes: {
    name: {
      type: 'string'
    },
    // sha256 hex of the token secret.
    hash: {
      type: 'string',
      required: true,
      unique: true
    },
    // Uses left. -1 is unlimited until `expires`.
    uses: {
      type: 'number',
      isInteger: true,
      defaultsTo: 1
    },
    // ms
    expires: {
      type: 'number'
    },
    createdBy: {
      type: 'string'
    }
  }
};
