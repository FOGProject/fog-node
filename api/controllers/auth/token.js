const jwt = require('jsonwebtoken'),
  jwtConfig = sails.config.auth.jwt,
  passport = require('passport');
module.exports = {
  friendlyName: 'Token',
  description: 'Token auth.',
  exits: {
    badRequest: {
      responseType: 'badRequest',
      description: 'Bad request'
    },
    invalidCredentials: {
      responseType: 'forbidden',
      description: 'Invalid Credentials'
    },
    success: {
      description: 'Login Successful'
    }
  },
  fn: async function (inputs) {
    let req = this.req,
      res = this.res,
      token = await jwt.sign({user: req.user.id}, jwtConfig.secret, jwtConfig.options);
    return {token};
  }
};
