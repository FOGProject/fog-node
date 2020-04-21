const passport = require('passport');
module.exports = async function(req, res, next) {
  try {
    await passport.authenticate('jwt-cookiecombo', async function(err, user, info) {
      if (err || !user) return next();
      let id = (
        user.id ?
        user.id :
        (
          user.sub ?
          user.sub :
          user
        )
      );
      await User.findOne({id}).populateAll().exec(async function(err, user) {
        if (err || !user) return next();
        user = user.toJSON();
        await req.login(user, async function(err) {
          if (err) return next(err);
          next();
        });
      });
    })(req, res);
  } catch (e) {
    next();
  }
};
