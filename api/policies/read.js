module.exports = async function(req, res, next) {
  let model = req.allParams();
  model = model.model;
  if (_.get(req, 'user.permissions.stock.'+model+'.read')) {
    return next();
  }
  res.forbidden();
  res.end();
};
