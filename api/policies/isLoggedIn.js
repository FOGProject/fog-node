const passport = require('passport');
const crypto = require('crypto');

module.exports = async (req, res, next) => {
  // 1) Opaque per-user API token: `Authorization: Bearer fpat_<token>`.
  //    Long-lived and independently resettable, distinct from the short-lived
  //    login JWT. We store only the SHA-256, so hash the presented token and
  //    look the user up by it. Tag the request so credential writes (password,
  //    token) can be refused for API clients (see general/create|update|save).
  let authHeader = req.headers && req.headers.authorization;
  let m = authHeader && /^Bearer\s+(fpat_[A-Za-z0-9]+)$/.exec(authHeader);
  if (m) {
    let hash = crypto.createHash('sha256').update(m[1]).digest('hex');
    let user = await User.findOne({ apiTokenHash: hash }).populateAll();
    if (user) {
      req.authVia = 'apitoken';
      return req.login(user.toJSON(), { session: false }, (err) => err ? next(err) : next());
    }
    // Unknown token: record it (never the token value), then fall through
    // unauthenticated -> isAuthenticated will 403.
    await sails.helpers.audit.record.with({req, row: {
      type: 'auth.token.rejected', outcome: 'denied', subjectType: 'system',
      authSource: 'apitoken', createdBy: ''
    }});
  }

  // 2) Session / JWT (cookie or bearer) auth -- existing behaviour.
  try {
    await passport.authenticate(sails.config.globals.jwtAuthMechanisms, { session: false }, async (err, user) => {
      if (err) return next(err);
      if (!user) return next();
      // The JWT strategy (cookie or header). A plain browser session sets no
      // authVia: the audit trail reads that as 'session'.
      req.authVia = 'jwt';
      user = user.toJSON();
      // keepSessionInfo: Passport >=0.6 regenerates the session on req.login
      // (fixation protection). Since this policy re-logs-in on every
      // authenticated request, a plain login would wipe the session each time --
      // including the CSRF secret -- so the token rendered on a GET never
      // validates on the following POST (403). Preserve existing session data
      // across the regenerate. (The apitoken path above is stateless: session:false.)
      await req.login(user, { keepSessionInfo: true }, async (err) => {
        if (err) return next(err);
        return next();
      });
    })(req, res);
  } catch (unusedErr) {
    return next();
  }
};
