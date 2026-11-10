/**
 * AgentEnrollment.js
 *
 * One fog-agent enrollment request, keyed by the fingerprint of the agent's
 * public key (one row per key). It is the memory of what was decided about that
 * key, so a repeat request is answered from the row. FOG 1.6 keeps the same
 * record in the agentEnrollment table (contract 2.1). The state machine is in
 * api/controllers/agent/enroll.js.
 *
 * Not generic CRUD: config/permissions.js has no stock entry for it, so the
 * /api/v1/:model routes refuse it. The admin routes are api/controllers/agent/.
 */
module.exports = {
  attributes: {
    // The id of the bound Host, or '' until the row is bound.
    host: {
      type: 'string',
      defaultsTo: ''
    },
    // sha256 hex of the public key PEM (api/helpers/agent/key-fingerprint.js).
    fingerprint: {
      type: 'string',
      required: true,
      unique: true
    },
    // The CSR of the FIRST request. Approval signs this one.
    csr: {
      type: 'string',
      required: true
    },
    // The identity block as the agent sent it.
    identity: {
      type: 'json'
    },
    hostname: {
      type: 'string'
    },
    os: {
      type: 'string'
    },
    arch: {
      type: 'string'
    },
    agentVersion: {
      type: 'string'
    },
    remoteIp: {
      type: 'string'
    },
    // unknown-host, known-host-no-agent, rebind, identity-conflict, reissue, no-mac
    reason: {
      type: 'string'
    },
    // pending, issued or denied
    state: {
      type: 'string',
      defaultsTo: 'pending'
    },
    // The issued leaf and chain, kept only until the agent collects them.
    cert: {
      type: 'string',
      defaultsTo: ''
    },
    // ms
    decidedAt: {
      type: 'number'
    },
    // The admin's user name, '' on an automatic path.
    decidedBy: {
      type: 'string'
    },
    // token, deploy or admin
    decidedVia: {
      type: 'string'
    }
  }
};
