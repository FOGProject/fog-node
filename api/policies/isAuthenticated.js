module.exports = async (req, res, next) => {
  if (req.isSocket) {
    if (req.session &&
      req.session.passport &&
      req.session.passport.user
    ) {
      return next();
    }
    res.unauthorized();
  } else if (req.isAuthenticated()) {
    return next();
  }
  if (req.wantsJSON) {
    res.forbidden();
    return res.end();
  }
  res.redirect('/login');
};
