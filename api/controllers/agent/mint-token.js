/**
 * POST /api/v1/agent/token
 *
 * Mint a fog-agent enrollment token (contract 2.2 and 6.2). Needs host.create.
 * Body {name, uses (default 1), expires (ms, or a date string)}, validated as
 * 1.6 does: name 1 to 191 characters, uses at least 1 or -1 (unlimited),
 * expires in the future. Answers {id, name, token, expires}. The token is 48 hex
 * characters from crypto.randomBytes(24) and is shown only here. Only its
 * sha256 is stored.
 */
const crypto = require('crypto');

module.exports = {
  friendlyName: 'Mint an agent token',
  description: 'Create an enrollment token and show it once.',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!_.get(req, 'user.permissions.stock.host.create')) {
      return res.forbidden();
    }
    const bad = (error) => res.status(400).json({error});

    const body = req.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name === '' || name.length > 191) { return bad('name is required, at most 191 characters'); }

    const given = body.uses;
    const uses = (given === undefined || given === null || given === '') ? 1 : Number(given);
    if (!Number.isInteger(uses) || (uses < 1 && uses !== -1)) { return bad('uses must be at least 1, or -1 for unlimited'); }

    const raw = body.expires;
    const expires = typeof raw === 'number' ? raw : (typeof raw === 'string' ? Date.parse(raw) : NaN);
    if (!Number.isFinite(expires) || expires <= Date.now()) { return bad('expires must be a date and time in the future'); }

    const token = crypto.randomBytes(24).toString('hex');
    const row = await sails.models.agentenrolltoken.create({
      name,
      hash: sails.models.agentenrolltoken.hashOf(token),
      uses,
      expires,
      createdBy: req.user.username
    }).fetch();
    return res.json({id: row.id, name, token, expires});
  }
};
