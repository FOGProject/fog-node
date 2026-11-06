const passport = require('passport');
const jwt = require('jsonwebtoken');
module.exports = {
  friendlyName: 'Login',
  description: 'Login auth.',
  exits: {
    success: {
      description: 'Login Successful'
    }
  },
  fn: async function (inputs, exits) {
    let req = this.req;
    let res = this.res;
    await passport.authenticate(sails.config.globals.authenticationMechanisms, async (err, user, info) => {
      if (err) return exits.error(err);
      // No user => bad credentials. Return a clean 401 (JSON) or bounce back to
      // the login form, instead of calling req.login(undefined) which throws a
      // 500 ("Failed to serialize user into session").
      if (!user) {
        let message = (info && info.message) || 'Invalid username or password';
        if (req.wantsJSON) {
          res.status(401);
          return res.json({message});
        }
        // A browser gets the FOG 1.6 failure toast (ProcessLogin.php:102,
        // 118-124) on the login page, through the session flash, not a
        // query parameter.
        sails.helpers.flash.with({req, type: 'error', text: 'Invalid Login', title: 'Login Failed'});
        return res.redirect('/login');
      }
      await req.login(user, async (err) => {
        if (err) return exits.error(err);
        await jwt.sign(
          {user: user.id},
          sails.config.auth.jwt.secret,
          sails.config.auth.jwt.options,
          async (err, token) => {
            if (err) return exits.error(err);
            if (!token) return exits.error('Invalid token created');
            if (req.param('remember-me') === 'on') res.cookie('jwt', token, sails.config.auth.jwt.cookie);
            if (req.wantsJSON) return exits.success({token});
            return res.redirect('/');
          }
        );
      });
    })(req, res);
  }
};
