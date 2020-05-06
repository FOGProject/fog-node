module.exports = {
  friendlyName: 'View login',
  description: 'Display "Login" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/login'
    }
  },
  fn: async function () {
    // Respond with view.
    return {
      title: 'Login',
      model: 'login'
    };
  }
};
