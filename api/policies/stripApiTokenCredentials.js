/**
 * Defence-in-depth: a request authenticated by an API token (Bearer fpat_...)
 * may NEVER write credentials -- the password or the API token hash -- through
 * ANY route, including Sails blueprint REST/shortcut routes that bypass the
 * per-action guards. Strip those fields from the request before the action runs.
 *
 * Credential changes are only possible through the dedicated, web-session-only
 * endpoints (user/reset-password, account/change-password, *.reset-api-token),
 * which additionally refuse API-token auth outright.
 */
module.exports = async (req, res, next) => {
  if (req.authVia === 'apitoken') {
    for (let bag of [req.body, req.query]) {
      if (bag && typeof bag === 'object') {
        delete bag.password;
        delete bag.apiTokenHash;
      }
    }
  }
  return next();
};
