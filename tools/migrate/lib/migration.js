const path = require('path');
const migrationsFolder = path.join(__dirname, '..', '..', '..', 'migrations');
const config = require('../../lib/config');
const database = require('../../lib/database');
const setting = require('../../lib/setting');
module.exports = {
  getMigrations: (start, end) => {
    if (start === end) return [];
    if (start < end && start === end+1) return [];
    let revisions = [];
    let toLoad = [];
    if (start < end) {
      for (let i = start + 1; i <= end; i++) {
        toLoad.push(i);
      }
    } else {
      for (let i = start; i > end; i--) {
        toLoad.push(i);
      }
    }

    for (let i = 0; i < toLoad.length; i++) {
      try {
        // path.join takes strings only: a number threw here, and every
        // revision read as missing.
        revisions[i] = require(path.join(migrationsFolder, String(toLoad[i])));
        revisions[i]._meta.schema = toLoad[i];
      } catch (unusedErr) {
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
    // The mongodb 3.x connect callback gives a MongoClient; each revision
    // gets its database. The client closes once, at the end.
    database.connect(conn, (err, client) => {
      if (err) return next(err);
      let done = (err) => {
        client.close();
        next(err);
      };
      let db = client.db();
      module.exports.getCurrentRevision(db, (err, current) => {
        if (err) return done(err);
        module.exports.run(db, current, target, step, done);
      });
    });
  },
  // Run the revisions from `current` to `target`, in order, one at a time.
  // After each one, the `schema` Setting holds the new revision, then the next
  // one starts. `next(err)` is called once: on the first error, or after the
  // last revision. `step(upgrade, fromRev, toRev, description)` is called as
  // each revision starts.
  run: (db, current, target, step, next) => {
    let upgrade = target > current;
    let revisions;
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
    let runFrom = (index) => {
      if (index >= revisions.length) return next();
      let rev = revisions[index];
      let toRev = rev._meta.schema;
      if (!upgrade) toRev--;
      step(upgrade, current, toRev, rev._meta.description);
      let action = (upgrade ? rev.up : rev.down);
      action(db, console, (err) => {
        if (err) return next(err);
        setting.set(db, 'schema', {revision: toRev}, (err) => {
          if (err) return next(err);
          current = toRev;
          runFrom(index + 1);
        });
      });
    };
    runFrom(0);
  }
};
