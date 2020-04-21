module.exports = async function(req, res, next) {
  if (req.isSocket) {
    if (req.session &&
      req.session.passport &&
      req.session.passport.user
    ) {
      res.ok('Already logged in');
      res.end();
    }
  } else {
    if (req.isAuthenticated()) {
      return res.redirect('/');
    }
  }
  return next();
};
