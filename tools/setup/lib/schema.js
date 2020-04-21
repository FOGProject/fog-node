const config = require('../../lib/config'),
  adminRole = {
    name: 'Administrator',
    isAdmin: true,
    permissions: {},
  },
  adminUser = {
    username: 'Administrator',
  },
  sails = require('sails');

module.exports = {
  generate: (adminPassword, adminEmail, next) => {
    let cfg = config.getMergedSettings();
    cfg.log = {
      level: 'error',
    };
    cfg.appPath = config.appPath;
    cfg.models = {};
    cfg.models.migrate = 'alter';
    adminUser.email = adminEmail;
    adminUser.password = adminPassword;
    sails.load(cfg, (err) => {
      if (err) return next(err);
      sails.models.setting.create({name: 'schema', value: {revision: cfg.schema}}, (err, setting) => {
        if (err) return next(err);
        sails.models.role.create(adminRole, (err, role) => {
          if (err) return next(err);
          adminUser.roles = [role.id];
          sails.models.user.create(adminUser, (err, user) => {
            if (err) return next(err);
            next();
          });
        });
      });
    });
  }
};
