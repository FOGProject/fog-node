/**
 * Issue the certificate for a bound fog-agent enrollment (contract 3.6;
 * Enrollment::_issue). Used by the automatic paths (api/helpers/agent/
 * auto-approve.js) and by the admin approve (api/controllers/agent/decide.js).
 *
 * It signs the STORED CSR (the first request's, not the latest) with
 * signCsr(csr, String(agentId)). The host number `agentId` is assigned here,
 * once, when the host first gets an agent: the next value of the counter
 * document {_id: 'agentId'} in the `counters` collection. A host that has an
 * agentId keeps it. A number is never reused, so a failed sign can leave a gap.
 *
 * On the host: agentFingerprint, agentNotAfter (UTC), agentVersion (from the
 * row), agentCheckin (now), pending false. On the row: state issued, decidedAt,
 * decidedBy, decidedVia. `keepCert` true (admin approve) stores the PEM in the
 * row's `cert` for the agent's next request. False (automatic) answers the
 * agent in the same request and leaves `cert` ''.
 *
 * Inputs: row (an AgentEnrollment record), via (token, deploy or admin), by
 * (the admin's user name, '' when automatic), keepCert, req (optional, for the
 * audit row `agent.enroll` that it writes).
 * Output {pem, agentId, notAfter}: pem is the leaf then the agent CA.
 *
 * Exits:
 *   notBound  the row has no host, or the host no longer exists
 *   signing   the CSR could not be signed (no PKI, root mismatch, bad CSR)
 *
 * Usage: let {pem, agentId, notAfter} = await sails.helpers.agent.issue.with({row, via, by, keepCert})
 */
const {leafInfo} = require('../../lib/agent-pki');
const ObjectId = require('mongodb').ObjectID;

module.exports = {
  friendlyName: 'Issue an agent certificate',
  description: 'Sign the stored CSR for the bound host and record the decision.',
  inputs: {
    row: {type: 'ref', required: true},
    via: {type: 'string', required: true},
    by: {type: 'string', defaultsTo: ''},
    keepCert: {type: 'boolean', defaultsTo: false},
    req: {type: 'ref', defaultsTo: null, description: 'The request, for the audit row.'}
  },
  exits: {
    success: {outputType: 'ref', description: '{pem, agentId, notAfter}'},
    notBound: {description: 'The row has no host, or the host is gone.'},
    signing: {description: 'The signing failed.'}
  },
  fn: async function ({row, via, by, keepCert, req}) {
    const Host = sails.models.host;
    const host = row.host ? await Host.findOne({id: row.host}) : undefined;
    if (!host) { throw 'notBound'; }

    let agentId = host.agentId;
    if (!(agentId > 0)) {
      const manager = sails.getDatastore(Host.datastore).manager;
      const counter = await manager.collection('counters')
        .findOneAndUpdate({_id: 'agentId'}, {$inc: {seq: 1}}, {upsert: true, returnDocument: 'after'});
      agentId = counter.value.seq;
      // Set it only while the host has none, so two issues for one host agree.
      const set = await manager.collection(Host.tableName).updateOne(
        {_id: new ObjectId(host.id), $or: [{agentId: {$exists: false}}, {agentId: 0}]},
        {$set: {agentId}});
      if (set.modifiedCount !== 1) {
        const again = await Host.findOne({id: host.id});
        if (!again || !(again.agentId > 0)) { throw 'notBound'; }
        agentId = again.agentId;
      }
    }

    let signed;
    try {
      signed = await sails.helpers.agent.signCsr.with({csrPem: row.csr, hostId: String(agentId)});
    } catch (err) {
      sails.log.warn(`agent enroll: signing for host ${host.id} failed: ${err.exit || err.message}`);
      throw 'signing';
    }
    const pem = signed.leafPem + signed.chainPem;
    const {notAfter} = leafInfo(signed.leafPem);

    const now = Date.now();
    await Host.updateOne({id: host.id}).set({
      agentFingerprint: row.fingerprint,
      agentNotAfter: notAfter,
      agentVersion: row.agentVersion,
      agentCheckin: now,
      pending: false
    });
    await sails.models.agentenrollment.updateOne({id: row.id}).set({
      state: 'issued',
      decidedAt: now,
      decidedBy: by,
      decidedVia: via,
      cert: keepCert ? pem : ''
    });
    // The 1.6 trail text (Enrollment::_issue): how, and which key.
    await sails.helpers.agent.audit.with({
      req, row, by, text: `issued via ${via}, key ${row.fingerprint.slice(0, 16)}`
    });
    return {pem, agentId, notAfter};
  }
};
