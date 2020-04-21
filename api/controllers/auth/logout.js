module.exports = {
  friendlyName: 'Logout',
  description: 'Logout auth.',
  inputs: {
  },
  exits: {
  },
  fn: async function (inputs) {
    let req = this.req,
      res = this.res;
    req.logout();
    res.clearCookie('jwt');
    res.redirect('/login');
  }
};
