const crypto = require('crypto');
const passport = require('passport');

// One id per HTTP request, for the audit trail (api/helpers/audit/record.js).
// It lives on the request object, not in module state, because Node serves
// requests concurrently. It is not sent to the client.
// This middleware also starts the audit seam for the request. It runs ahead of
// the router, so the seam sees every response, a Sails CSRF refusal included
// (api/hooks/audit). The hook is absent only when it is disabled.
const correlationId = (req, res, next) => {
  req.correlationId = crypto.randomBytes(16).toString('hex');
  if (sails.hooks.audit) { sails.hooks.audit.watch(req, res); }
  return next();
};

// Passport's session() middleware requires an active session. Sails skips
// session setup for asset-looking requests (see the commented isSessionDisabled
// note in config/session.js / LOOKS_LIKE_ASSET_RX), so running passport on those
// requests throws "Login sessions require session support" and turns every
// CSS/JS asset into a 500 -- which renders every page unstyled. Only run the
// passport middleware when a session is actually present.
const onlyWithSession = (middleware) => (req, res, next) =>
  req.session ? middleware(req, res, next) : next();

module.exports.http = {
  // req.ip is the socket address unless Express trusts the proxy. Audit rows
  // and agent enrollment rows record req.ip. Behind a reverse proxy, set
  // http: {trustProxy: true} in config/local.js (docs/install.md) so they
  // record the client address. npm run setup keeps that setting.
  trustProxy: false,
  middleware: {
    correlationId,
    passportInit: onlyWithSession(passport.initialize()),
    passportSession: onlyWithSession(passport.session()),
    order: [
      'correlationId',
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
