/**
 * POST /api/v1/agent/enrollment/:id/:action
 *
 * An admin approves or denies a pending fog-agent enrollment (contract 3.6 and
 * 6.2). Needs host.update. `action` is approve or deny.
 *
 *   approve  signs the STORED CSR, binds the key to the host, and keeps the
 *            certificate in the row. The agent collects it on its next request.
 *   deny     the row is final, as in 1.6: a denied key is never approved later.
 *            The pending host that the request created stays.
 *
 * Errors are {error: '<message>'}: 404 unknown action / no such enrollment,
 * 409 enrollment is not pending / enrollment is not bound to a host, 503 signing.
 * Success is {id, hostID, state}.
 */
module.exports = {
  friendlyName: 'Decide an agent enrollment',
  description: 'Approve or deny a pending agent enrollment.',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!_.get(req, 'user.permissions.stock.host.update')) {
      return res.forbidden();
    }
    const action = req.param('action');
    if (action !== 'approve' && action !== 'deny') {
      return res.status(404).json({error: 'unknown action'});
    }
    const Enrollment = sails.models.agentenrollment;
    const row = await Enrollment.findOne({id: req.param('id')});
    if (!row) { return res.status(404).json({error: 'no such enrollment'}); }
    if (row.state !== 'pending') { return res.status(409).json({error: 'enrollment is not pending'}); }

    const by = req.user.username;
    if (action === 'deny') {
      await Enrollment.updateOne({id: row.id}).set({state: 'denied', cert: '', decidedAt: Date.now(), decidedBy: by, decidedVia: 'admin'});
      return res.json({id: row.id, hostID: row.host, state: 'denied'});
    }

    try {
      await sails.helpers.agent.issue.with({row, via: 'admin', by, keepCert: true});
    } catch (err) {
      if (err.exit === 'notBound') { return res.status(409).json({error: 'enrollment is not bound to a host'}); }
      return res.status(503).json({error: 'signing'});
    }
    return res.json({id: row.id, hostID: row.host, state: 'issued'});
  }
};
