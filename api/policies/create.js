module.exports = async function(req, res, next) {
  'use strict';
  let model = req.allParams();
  model = model.model;
  return next();
  if (_.get(req, 'user.permissions.stock.'+model+'.create')) {
    return next();
  }
  res.forbidden();
  res.end();
};
