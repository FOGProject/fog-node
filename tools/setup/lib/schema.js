const config = require('../../lib/config'),
  sails = require('sails');
var adminRole = {
    name: 'Administrator',
    isAdmin: true,
    permissions: {},
  },
  adminUser = {
    username: 'Administrator',
  },
  schema = {
    name: 'schema',
    value: {
      revision: 0
    }
  };

module.exports = {
  generate: (adminPassword, adminEmail, next) => {
    let cfg = config.getMergedSettings();
    cfg.log = {
      level: 'error',
    };
    if (!cfg.schema) cfg.schema = 1;
    cfg.appPath = config.appPath;
    cfg.models = {};
    cfg.models.migrate = 'alter';
    adminUser.email = adminEmail;
    adminUser.password = adminPassword;
    sails.load(cfg, async (err) => {
      if (err) return next(err);
      if (!cfg.schema) cfg.schema = 1;
      schema.value.revision = cfg.schema;
      await sails.models.setting.findOrCreate({name: schema.name}, schema, async (err, setting) => {
        if (err) return next(err);
        schema.id = setting.id;
        await sails.models.setting.updateOne({id: setting.id}, schema, async (err, setting) => {
          if (err) return next(err);
        });
        await sails.models.role.findOrCreate({name: adminRole.name}, adminRole, async (err, role) => {
          if (err) return next(err);
          adminRole.id = role.id;
          await sails.models.role.updateOne({id: role.id}, adminRole, async (err, role) => {
            if (err) return next(err);
          });
          adminUser.roles = [role.id];
          await sails.models.user.findOrCreate({username: adminUser.username}, adminUser, async (err, user) => {
            if (err) return next(err);
            adminUser.id = user.id;
            await sails.models.user.updateOne({id: user.id}, adminUser, async (err, user) => {
              if (err) return next(err);
              next();
            });
          });
        });
      });
    });
  }
};
