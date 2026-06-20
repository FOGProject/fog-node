const passport = require('passport');

// Passport's session() middleware requires an active session. Sails skips
// session setup for asset-looking requests (see the commented isSessionDisabled
// note in config/session.js / LOOKS_LIKE_ASSET_RX), so running passport on those
// requests throws "Login sessions require session support" and turns every
// CSS/JS asset into a 500 -- which renders every page unstyled. Only run the
// passport middleware when a session is actually present.
const onlyWithSession = (middleware) => (req, res, next) =>
  req.session ? middleware(req, res, next) : next();

module.exports.http = {
  middleware: {
    passportInit: onlyWithSession(passport.initialize()),
    passportSession: onlyWithSession(passport.session()),
    order: [
      'cookieParser',
      'session',
      'passportInit',
      'passportSession',
      'bodyParser',
      'compress',
      'poweredBy',
      'router',
      'www',
      'favicon'
    ]
  }
};
