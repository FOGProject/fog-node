const jwt = require('jsonwebtoken'),
  jwtConfig = sails.config.auth.jwt,
  passport = require('passport');
module.exports = {
  friendlyName: 'Token',
  description: 'Token auth.',
  exits: {
    success: {
      description: 'Login Successful'
    }
  },
  fn: async function (inputs, exits) {
    let req = this.req,
      res = this.res;
    await jwt.sign({user: req.user.id}, jwtConfig.secret, jwtConfig.options, async (err, token) => {
      return exits.success({token});
    });
  }
};
