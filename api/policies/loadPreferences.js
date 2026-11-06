/**
 * Puts the signed-in user's stored theme in `res.locals.fogTheme`, for
 * views/layouts/layout.ejs: the server-rendered data-bs-theme on <html> and
 * the #themePref carrier. That is how a stored Dark paints dark at once in
 * any browser.
 *
 * Read-only, and it never denies. With no user, or on a read error, the page
 * renders with no stored theme, and the pre-paint script in the layout follows
 * the system theme.
 *
 * config/policies.js runs it on the '*' and account/* chains. A plugin page
 * route bound as a plain function skips the policy chain, so
 * api/hooks/plugins/index.js runs this first on each one.
 */
const UserPrefStore = require('../services/UserPrefStore');

module.exports = async function (req, res, proceed) {
  if (req.user && req.user.id) {
    try {
      let prefs = await UserPrefStore.read(req.user.id, ['display.theme']);
      res.locals.fogTheme = prefs['display.theme'];
    } catch (err) {
      sails.log.warn(`loadPreferences: cannot read the theme of user ${req.user.id}: ${err.message}`);
    }
  }
  return proceed();
};
