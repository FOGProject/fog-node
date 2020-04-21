const passport = require('passport'),
  JWTStrategy = require('passport-jwt-cookiecombo'),
  jwt = require('jsonwebtoken'),
  locals = require('../../config/local'),
  opts = {
    secretOrPublicKey: locals.auth.jwt.secret,
    jwtVerifyOptions: locals.auth.jwt.options,
    session: locals.auth.jwt.session
  };
passport.serializeUser(function(user, done) {
  id = (
    user.id ?
    user.id :
    (
      user.sub ?
      user.sub :
      user
    )
  );
  done(null, id);
});
passport.deserializeUser(function(user, done) {
  done(null, user);
});
passport.use(new JWTStrategy(opts,
  async function(jwt_payload, done) {
    if (!jwt_payload) return done(null, false, {message: 'No token passed'});
    if (!jwt_payload.user) return done(null, false, {message: 'No user information present'});
    await User.findOne({id: jwt_payload.user}).populateAll().exec(async function(err, user) {
      if (err) return done(err, false, {message: 'An error occurred locating the user'});
      if (!user) return done(null, jwt_payload.user, {message: 'User is not Localized'});
      user = user.toJSON();
      user.isLocalAuth = true;
      user.isJWTAuth = true;
      done(null, user, {message: 'Login Successful'});
    });
  }
));
