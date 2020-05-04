const passport = require('passport');
module.exports = async function(req, res, next) {
  try {
    await passport.authenticate('jwt-cookiecombo', async function(err, user, info) {
      if (err || !user) return next();
      if (!user.id) {
        return await req.login(user, async function(err) {
          if (err) return next(err);
          return next();
        });
      }
      await User.findOne({id: user.id}).populateAll().exec(async function(err, u) {
        if (err || !u) return next();
        await req.login(u, async function(err) {
          if (err) return next(err);
          next();
        });
      });
    })(req, res);
  } catch (e) {
    next();
  }
};
