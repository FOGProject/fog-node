module.exports = {
  friendlyName: 'View hwinfo',
  description: 'Display "Hwinfo" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/hwinfo'
    }
  },
  fn: async function () {
    let data = await sails.helpers.system.hwinfo(),
      partialname = false;
    // Respond with view.
    return {
      data,
      title: 'Server Information',
      partialname
    };
  }
};
