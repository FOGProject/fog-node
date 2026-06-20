module.exports = {
  friendlyName: 'Search (API)',
  description: 'Global search across user-facing models (JSON), filtered by read permissions.',
  fn: async function () {
    let req = this.req,
      q = req.param('q') || '';
    return await sails.helpers.globalSearch.with({
      q,
      permissions: _.get(req, 'user.permissions') || {}
    });
  }
};
