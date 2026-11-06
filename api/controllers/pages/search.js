module.exports = {
  friendlyName: 'Search',
  description: 'Global search results page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/search'
    }
  },
  fn: async function () {
    let req = this.req;
    let q = req.param('q') || '';
    let groups = await sails.helpers.globalSearch.with({
      q,
      permissions: _.get(req, 'user.permissions') || {}
    });
    return {
      // The content header and tab title, in the FOG 1.6 shape (fog-node
      // only). With no term, the page title is empty and the tab reads "Search".
      section: 'Search',
      page: q ? `Results for "${q}"` : '',
      model: 'search',
      partialname: false,
      q,
      groups
    };
  }
};
