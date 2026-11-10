/**
 * DELETE /api/v1/agent/token/:id
 *
 * Revoke a fog-agent enrollment token: the row goes, so its hash can never
 * match again (contract 2.2 and 6.2). Needs host.destroy. 404 {error: 'no such
 * token'} when it does not exist; else {id}.
 */
module.exports = {
  friendlyName: 'Revoke an agent token',
  description: 'Delete an enrollment token.',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!sails.helpers.audit.can(req, 'host.destroy')) {
      return res.forbidden();
    }
    const row = await sails.models.agentenrolltoken.destroyOne({id: req.param('id')});
    if (!row) { return res.status(404).json({error: 'no such token'}); }
    // The 1.6 trail text (Token::revoke). The name survives in the row.
    await sails.helpers.audit.record.with({req, row: {
      type: 'agent.token',
      subjectType: 'agentenrolltoken',
      subjectId: row.id,
      subjectLabel: row.name,
      permission: 'host.destroy',
      outcome: 'allowed',
      renderable: true,
      text: `revoked by ${req.user.username}`
    }});
    return res.json({id: row.id});
  }
};
