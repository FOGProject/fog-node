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
    // 'safe' = never auto-migrate. Mongo is schemaless so no migration is needed,
    // and 'alter' can drop/recreate collections (data loss) -- catastrophically so
    // if another app instance is pointed at the same database while this runs.
    cfg.models.migrate = 'safe';
    adminUser.email = adminEmail;
    adminUser.password = adminPassword;
    sails.load(cfg, async (err) => {
      if (err) return next(err);
      if (!cfg.schema) cfg.schema = 1;
      schema.value.revision = cfg.schema;
      await Setting.findOrCreate({name: schema.name}, schema, async (err, setting) => {
        if (err) return next(err);
        await Role.findOrCreate({name: adminRole.name}, adminRole, async (err, role) => {
          if (err) return next(err);
          adminUser.roles = [role.id];
          await User.findOrCreate({username: adminUser.username}, adminUser, async (err, user) => {
            if (err) return next(err);
            next();
          });
        });
      });
    });
  }
};
