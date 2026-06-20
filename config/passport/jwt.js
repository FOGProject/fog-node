const passport = require('passport'),
  JWTStrategy = require('passport-jwt-cookiecombo'),
  jwt = require('jsonwebtoken'),
  locals = require('../../config/local'),
  opts = {
    secretOrPublicKey: locals.auth.jwt.secret,
    jwtVerifyOptions: locals.auth.jwt.options,
    session: locals.auth.jwt.session
  };
passport.serializeUser(async (user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  await User.findOne({id}).populateAll().exec(async (err, user) => {
    if (err) return done(err);
    // toJSON() runs the User model's customToJSON, which computes `permissions`
    // from the user's roles. Without it, session-authenticated requests (browser
    // login without "Remember Me") get a req.user with no permissions, so every
    // permission-checked action (create, list datatable, ...) 403s.
    done(null, user ? user.toJSON() : false);
  });
});
passport.use(new JWTStrategy(opts,
  async (jwt_payload, done) => {
    if (!jwt_payload) return done(null, false, {message: 'No token passed'});
    if (!jwt_payload.user) return done(null, false, {message: 'No user information present'});
    await User.findOne({id: jwt_payload.user}).populateAll().exec(async (err, user) => {
      if (err) return done(err, false, {message: 'An error occurred locating the user'});
      if (user) {
        user.isLocalAuth = true;
        user.isJWTAuth = true;
      }
      done(null, user);
    });
  }
));
