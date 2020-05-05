module.exports = async (req, res, next) => {
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
      if (req.wantsJSON) {
        res.ok('Already logged in');
        return res.end();
      }
      return res.redirect('/');
    }
  }
  return next();
};
