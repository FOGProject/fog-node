const config = require('../../lib/config');
const sails = require('sails');
const _ = require('@sailshq/lodash');
var adminRole = {
  name: 'Administrator',
  isAdmin: true,
  permissions: {},
};
var adminUser = {
  username: 'Administrator',
};
var schema = {
  name: 'schema',
  value: {
    revision: 0
  }
};

module.exports = {
  // `overrides` (optional) is merged over a copy of the config, for example
  // the datastore of the UI smoke test (tools/smoke/ui.js). It comes after
  // `next` so that the two setup callers (dev.js, index.js) stay as they are.
  generate: (adminPassword, adminEmail, next, overrides) => {
    let cfg = config.getMergedSettings();
    if (overrides) cfg = _.merge({}, cfg, overrides);
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
      await Setting.findOrCreate({name: schema.name}, schema, async (err) => {
        if (err) return next(err);
        await Role.findOrCreate({name: adminRole.name}, adminRole, async (err, role) => {
          if (err) return next(err);
          adminUser.roles = [role.id];
          // findOrCreate leaves an existing Administrator untouched, password
          // included. Report whether it was created, so the installer does not
          // print a password that the account does not have.
          await User.findOrCreate({username: adminUser.username}, adminUser, async (err, user, created) => {
            if (err) return next(err);
            next(null, {adminCreated: created});
          });
        });
      });
    });
  }
};
