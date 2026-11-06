module.exports = {
  friendlyName: 'Search (API)',
  description: 'Global search across user-facing models (JSON), filtered by read permissions.',
  fn: async function () {
    let req = this.req;
    let q = req.param('q') || '';
    // The per-type limit, as in FOG 1.6 (Route.php:5435-5443): a positive
    // number caps each type; a missing value, a non-number, 0 or a negative
    // number means no limit. A value past the safe integer range also means
    // no limit: MongoDB's $limit rejects it, and no type holds that many.
    let limit = parseInt(req.query.limit, 10);
    if (!(Number.isSafeInteger(limit) && limit > 0)) { limit = 0; }
    return await sails.helpers.globalSearch.with({
      q,
      permissions: _.get(req, 'user.permissions') || {},
      limit
    });
  }
};
