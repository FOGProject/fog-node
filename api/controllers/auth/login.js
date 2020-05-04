const passport = require('passport'),
  jwt = require('jsonwebtoken');
module.exports = {
  friendlyName: 'Login',
  description: 'Login auth.',
  exits: {
    success: {
      description: 'Login Successful'
    }
  },
  fn: async function (inputs, exits) {
    let req = this.req,
      res = this.res;
    await passport.authenticate(sails.config.globals.authenticationMechanisms, async function(err, user, info) {
      if (err) return exits.error(err);
      if (!user) return;
      await req.login(user, async function(err) {
        if (err) return exits.error(err);
        await jwt.sign(
          {user},
          sails.config.auth.jwt.secret,
          sails.config.auth.jwt.options,
          async function(err, token) {
            if (err) return exits.error(err);
            if (!token) return exits.error('Invalid token created');
            if (req.param('remember-me') == 'on') res.cookie('jwt', token, sails.config.auth.jwt.cookie);
            if (req.wantsJSON) return exits.success({token});
            return res.redirect('/');
          }
        );
      });
    })(req, res);
  }
};
