module.exports = async function(req, res, next) {
  'use strict';
  if (_.get(req, 'user.permissions.stock.role.assign')) {
    return next();
  }
  res.forbidden();
  res.end();
};
