/**
 * POST /agent/v1/renew
 *
 * An enrolled fog-agent sends a CSR for its own key and gets a new certificate
 * (contract 1.3). The policy agentPrincipal proved the old certificate and set
 * req.agentHost. The same agent binary works against FOG 1.6, so the statuses,
 * the JSON keys and the strings are 1.6's:
 *
 *   200 {status: issued, host_id, certificate_pem, not_after}
 *   400 {status: error, error}   the CSR is bad, or it is for another key
 *   503 {status: error, error}   agent certificate issuance is not configured
 *
 * The fingerprint does not change and the old certificate stays valid: the
 * binding is the key. It writes the 1.6 audit row (Enrollment.php:581-595):
 * agent.enroll, authSource agent, "certificate renewed to <notAfter>, key <16>".
 * The actor is (system), as in 1.6: an agent request has no signed-in user.
 */
const {MAX_CSR, jsonBody, leafInfo} = require('../../lib/agent-pki');

module.exports = {
  friendlyName: 'Agent renew',
  description: 'Sign a new certificate for the key of an enrolled fog-agent.',
  exits: {
    success: {description: 'The answer is in the response.'}
  },
  fn: async function () {
    const req = this.req;
    const res = this.res;
    const host = req.agentHost;
    const body = jsonBody(req);
    const fail = (status, error) => res.status(status).json({status: 'error', error});

    const csr = (typeof body.csr_pem === 'string' && body.csr_pem.length <= MAX_CSR) ? body.csr_pem : '';
    let fingerprint;
    try {
      await sails.helpers.agent.verifyCsr(csr);
      fingerprint = sails.helpers.agent.keyFingerprint(csr);
    } catch (unused) {
      return fail(400, 'csr_pem is not a certificate request');
    }
    if (fingerprint !== host.agentFingerprint) {
      return fail(400, 'the request is not for the key this certificate proved');
    }

    let signed;
    try {
      signed = await sails.helpers.agent.signCsr.with({csrPem: csr, hostId: String(host.agentId)});
    } catch (err) {
      sails.log.warn(`agent renew: signing for host ${host.id} failed: ${err.exit || err.message}`);
      return fail(503, 'agent certificate issuance is not configured');
    }
    const {notAfter} = leafInfo(signed.leafPem);
    const updated = await sails.models.host.updateOne({id: host.id}).set({agentNotAfter: notAfter, agentCheckin: Date.now()});
    await sails.helpers.audit.record.with({req, row: {
      type: 'agent.enroll',
      subjectType: 'host',
      subjectId: host.id,
      subjectLabel: host.name,
      renderable: true,
      outcome: 'allowed',
      text: `certificate renewed to ${updated.agentNotAfter}, key ${fingerprint.slice(0, 16)}`,
      authSource: 'agent'
    }});
    return res.status(200).json({
      status: 'issued',
      host_id: host.agentId,
      certificate_pem: signed.leafPem + signed.chainPem,
      not_after: updated.agentNotAfter
    });
  }
};
