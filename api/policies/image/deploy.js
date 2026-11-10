module.exports = async function(req, res, next) {
  'use strict';
  if (sails.helpers.audit.can(req, 'image.deploy')) {
    return next();
  }
  res.forbidden();
  res.end();
};
