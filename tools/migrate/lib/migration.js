const fs = require('fs'),
  path = require('path'),
  migrationsFolder = path.join(__dirname, '..', '..', '..', 'migrations'),
  config = require('../../lib/config'),
  database = require('../../lib/database'),
  setting = require('../../lib/setting');
module.exports = {
  getMigrations: (start, end) => {
    if (start == end) return [];
    if (start < end && start == end+1) return [];
    let revisions = [],
      toLoad = [];
    if (start < end) {
      for (var i = start + 1; i <= end; i++) {
        toLoad.push(i);
      }
    } else {
      for (var i = start; i > end; i--) {
        toLoad.push(i);
      }
    }

    for (var i = 0; i < toLoad.length; i++) {
      try {
        revisions[i] = require(path.join(migrationsFolder, toLoad[i]));
        revisions[i]._meta.schema = toLoad[i];
      } catch (e) {
        throw `Missing migration file for schema ${toLoad[i]}`;
      }
    }
    return revisions;
  },
  getCurrentRevision: (db, next) => {
    setting.get(db, 'schema', (err, value) => {
      if (err) return next(err);
      if (!value || value.revision === undefined) return next('Schema revision not set in database');
      if (isNaN(value.revision)) return next('Schema revision is not a number');
      next(null, parseInt(value.revision, 10));
    });
  },
  auto: (conn, step, next) => {
    let cfg = config.getMergedSettings();
    module.exports.manual(conn, cfg.schema, step, next);
  },
  manual: (conn, target, step, next) => {
    let cfg = config.getMergedSettings();
    if (target < 0) return next('Cannot migrate to schema lower than 0');
    if (target > cfg.schema) return next(`Cannot migrate to a schema greater than ${cfg.schema}`);
    database.connect(conn.host, conn.port, conn.database, conn.user, conn.password, (err, db) => {
      if (err) return next(err);
      module.exports.getCurrentRevision(db, (err, current) => {
        if (err) return next(err);
        let upgrade = target > current,
          revisions;
        try {
          revisions = module.exports.getMigrations(current, target);
        } catch (e) {
          return next(e);
        }
        for (var i = 0; i < revisions.length; i++) {
          if (!revisions[i]) return next(`Missing migration file for schema ${i+1}`);
          if (!revisions[i]._meta ||
            !revisions[i]._meta.schema ||
            !revisions[i]._meta.description
          ) return next(`Missing meta data in migration file for schema ${i+1}`);
          if (!revisions[i].up ||
            typeof revisions[i].up !== 'function' ||
            !revisions[i].down ||
            typeof revisions[i].down !== 'function'
          ) return next(`Malformed migration file for schema ${i+1}`);
        }
        revisions.eachSeries((rev, next) => {
          let toRev = rev._meta.schema;
          if (!upgrade) toRev--;
          step(upgrade, current, toRev, rev._meta.description);
          let action = (upgrade ? rev.up : rev.down);
          action(db, console, (err) => {
            if (err) {
              db.close();
              return next(err);
            }
            current = toRev;
            setting.set(db, 'schema': {revision: toRev}, next);
          });
        });
        db.close();
        next();
      });
    });
  }
};
