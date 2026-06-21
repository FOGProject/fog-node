/**
 * CSRF defence for the `/api/v1` surface, which is exempted from Sails' built-in
 * CSRF protection so Bearer-token / JWT API clients (no session cookie) work.
 *
 * For cookie/session-authenticated state changes there we still need protection:
 *   - API-token requests (req.authVia === 'apitoken') carry no cookie, so a
 *     cross-site request can't forge them -> allow.
 *   - Same-origin AJAX sets `X-Requested-With: XMLHttpRequest`, which a cross-
 *     origin attacker cannot set without a CORS preflight that same-origin
 *     policy blocks -> allow.
 *   - Anything else mutating (a plain cross-site cookie POST) is refused.
 */
module.exports = async (req, res, next) => {
  let method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
  if (req.authVia === 'apitoken') return next();
  if ((req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest') return next();
  res.forbidden();
  return res.end();
};
