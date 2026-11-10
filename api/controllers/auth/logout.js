module.exports = {
  friendlyName: 'Logout',
  description: 'Logout auth.',
  inputs: {
  },
  exits: {
  },
  fn: async function () {
    let req = this.req;
    let res = this.res;
    // Record the sign-out BEFORE req.logout: after it the user is gone and the
    // row would name nobody.
    await sails.helpers.audit.record.with({req, row: {
      type: 'auth.logout', outcome: 'allowed', subjectType: 'user',
      subjectId: req.user.id, subjectLabel: req.user.username
    }});
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
