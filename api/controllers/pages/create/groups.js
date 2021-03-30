module.exports = {
  friendlyName: 'View groups create',
  description: 'Display "Groups create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    // Respond with view.
    return {};
  }
};
