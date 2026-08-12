const jwt = require('jsonwebtoken');
const jwtConfig = sails.config.auth.jwt;
const passport = require('passport');
module.exports = {
  friendlyName: 'Token',
  description: 'Token auth.',
  exits: {
    success: {
      description: 'Login Successful'
    }
  },
  fn: async function (inputs, exits) {
    let req = this.req;
    let res = this.res;
    await jwt.sign({user: req.user.id}, jwtConfig.secret, jwtConfig.options, async (err, token) => {
      // Without these the endpoint answered 200 with `{token: undefined}`
      // whenever signing failed, handing the caller a success it could not
      // use. Mirrors the handling in auth/login.js, which signs the same way.
      if (err) return exits.error(err);
      if (!token) return exits.error('Invalid token created');
      return exits.success({token});
    });
  }
};
