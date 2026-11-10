/**
 * GET /api/v1/agent/tokens
 *
 * The fog-agent enrollment tokens, for the admin (contract 2.2 and 6.2). Needs
 * host.read. `state` is spent (no use left), else expired, else active. It
 * never returns the hash.
 */
module.exports = {
  friendlyName: 'Agent tokens',
  description: 'List the agent enrollment tokens.',
  fn: async function () {
    const res = this.res;
    if (!sails.helpers.audit.can(this.req, 'host.read')) {
      return res.forbidden();
    }
    const now = Date.now();
    const rows = await sails.models.agentenrolltoken.find().sort('createdAt ASC');
    return res.json({
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        uses: row.uses,
        expires: row.expires,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        state: row.uses === 0 ? 'spent' : (row.expires < now ? 'expired' : 'active')
      }))
    });
  }
};
