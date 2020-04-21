module.exports = async function(req, res, next) {
  'use strict';
  let model = req.allParams();
  model = model.model;
  if (_.get(req, 'user.permissions.stock.'+model+'.destroy')) {
    return next();
  }
  res.forbidden();
  res.end();
};
