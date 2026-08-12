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
      return exits.success({token});
    });
  }
};
