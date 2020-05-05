const passport = require('passport'),
  LocalStrategy = require('passport-local').Strategy,
  bcrypt = require('bcryptjs');
passport.serializeUser(async (user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  await User.findOne({id}).populateAll().exec(async (err, user) => {
    if (err) return done(err);
    done(null, user);
  });
});
passport.use(new LocalStrategy(
  async function(username, password, done) {
    await User.findOne({
      where: {
        or: [
          {username: username},
          {email: username}
        ]
      }
    }).populateAll().exec(async (err, user) => {
      if (err) return done(err, false, {message: 'Error occurred finding user'});
      if (!user) return done(null, false, {message: 'Invalid Username'});
      await bcrypt.compare(password, user.password, (err, match) => {
        if (err) return done(err, false, {message: 'Error occurred comparing password'});
        if (!match) return done(null, false, {message: 'Invalid Password'});
        user.isLocalAuth = true;
        user.displayName = user.displayName || user.username;
        done(null, user, {message: 'Login Successful'});
      });
    });
  }
));
