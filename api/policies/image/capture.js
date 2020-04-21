module.exports = async function(req, res, next) {
  'use strict';
  if (_.get(req, 'user.permissions.stock.image.capture')) {
    return next();
  }
  res.forbidden();
  res.end();
};
