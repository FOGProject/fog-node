module.exports = {
  friendlyName: 'Search',
  description: 'Global search results page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/search'
    }
  },
  fn: async function () {
    let req = this.req,
      q = req.param('q') || '',
      groups = await sails.helpers.globalSearch.with({
        q,
        permissions: _.get(req, 'user.permissions') || {}
      });
    return {
      title: q ? `Search: ${q}` : 'Search',
      header: q ? `Search results for "${q}"` : 'Search',
      model: 'search',
      partialname: false,
      q,
      groups
    };
  }
};
