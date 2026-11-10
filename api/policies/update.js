module.exports = async function(req, res, next) {
  let model = req.allParams();
  model = model.model;
  if (sails.helpers.audit.can(req, model + '.update')) {
    return next();
  }
  res.forbidden();
  res.end();
};
