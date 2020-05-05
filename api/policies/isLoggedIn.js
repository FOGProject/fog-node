const passport = require('passport');
module.exports = async (req, res, next) => {
  try {
    await passport.authenticate(sails.config.globals.jwtAuthMechanisms, {session: false}, async (err, user, info) => {
      if (err) return next(err);
      if (!user) return next();
      user = user.toJSON();
      await req.login(user, async (err) => {
        if (err) return next(err);
        next();
      });
    })(req, res);
  } catch (e) {
    next();
  }
};
