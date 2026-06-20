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
    // passport >= 0.6 made req.logout() asynchronous -- it requires a callback
    // and throws (500) if called the old synchronous way. Await it so the action
    // doesn't return (and send a default response) before the redirect.
    await new Promise((resolve, reject) => {
      req.logout((err) => (err ? reject(err) : resolve()));
    });
    res.clearCookie('jwt');
    return res.redirect('/login');
  }
};
