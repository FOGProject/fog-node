module.exports = async function(req, res, next) {
  'use strict';
  if (sails.helpers.audit.can(req, 'image.capture')) {
    return next();
  }
  res.forbidden();
  res.end();
};
