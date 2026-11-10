// chalk 5+ is ESM-only: the chalk object is the default export.
const chalk = require('chalk').default;
const fs = require('fs');
const path = require('path');
const header = require('../lib/header');
const config = require('../lib/config');
const cfgPath = path.join(config.appPath, 'config');
const modelsCfg = path.join(cfgPath, 'models.js');
const localCfg = path.join(cfgPath, 'local.js');
const inquire = require('./lib/inquire');
const schema = require('./lib/schema');
const seedDemo = require('./seed-demo');
const secure = require('./lib/secure');
const pki = require('./pki');
const async = require('async');
const CLI = require('clui');
const Spinner = CLI.Spinner;
const welcome = `Welcome to the FOG installer.\nYou will be guided through configuring your new server for production.`;

var COMPLETED = false;
var payload = {};

// Escape a value for a single-quoted JS string in a generated config file.
// A Windows path has backslashes, which would otherwise become escapes.
const jsStr = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, '\\\'');

header.print(welcome);

async.waterfall([
  // Database Config
  (next) => {
    header.printSection('Database Configuration');
    inquire.getDatabaseInfo((answers) => {
      if (!answers.username.length) delete answers.username;
      payload.datastores = payload.datastores || {};
      payload.datastores.fogdb = answers;
      payload.datastores.fogdb.adapter = 'sails-mongo';
      next();
    });
  },
  // Redis (session store) Config
  (next) => {
    header.printSection('Session Store Configuration');
    inquire.getRedisInfo((answers) => {
      payload.redisUrl = answers.url;
      next();
    });
  },
  // Server URL + image store
  (next) => {
    header.printSection('Server Configuration');
    inquire.getServerInfo((answers) => {
      payload.server = answers;
      next();
    });
  },
  // Admin Config
  (next) => {
    header.printSection('Administrator Account Configuration');
    inquire.getAdminInfo((answers) => {
      payload.admin = answers;
      next();
    });
  },
  // Secure session
  (next) => {
    header.printSection('Securing Installation');
    let status = new Spinner('Generating session secret');
    status.start();
    payload.session = {};
    payload.session.secret = secure.generateSecret();
    status.stop();
    console.log('Session secret generated');
    next();
  },
  // Secure JWT
  (next) => {
    header.printSection('Generating JWT Secret');
    let status = new Spinner('Generating JWT secret');
    status.start();
    payload.auth = {};
    payload.auth.bcrypt = {
      rounds: 10
    };
    payload.auth.jwt = {};
    payload.auth.jwt.secret = secure.generateSecret();
    payload.auth.jwt.options = {
      expiresIn: '1d'
    };
    payload.auth.jwt.session = false;
    payload.auth.jwt.cookie = {
      signed: true,
      maxAge: 24 * 1000 * 60 * 60
    };
    status.stop();
    console.log('JWT secret generated');
    next();
  },
  // Save configuration
  (next) => {
    header.printSection('Applying Configuration');
    let status = new Spinner('Saving configuration');
    status.start();
    // config/http.js is tracked in git and is already correct. The installer
    // used to overwrite it with an older copy, which dirtied the checkout.
    // It now writes only the two git-ignored files, local.js and models.js.

    /**
     * models.js
     */
    // A re-run must keep the existing data encryption key. A new key makes
    // every attribute encrypted under the old one unreadable.
    let encKey = secure.generateSecret();
    let keptKey = false;
    if (fs.existsSync(modelsCfg)) {
      try {
        const old = require(modelsCfg).models;
        if (old && old.dataEncryptionKeys && old.dataEncryptionKeys.default) {
          encKey = old.dataEncryptionKeys.default;
          keptKey = true;
        }
      } catch (err) {
        status.stop();
        return next(`config/models.js exists but cannot be read, so its encryption key cannot be kept. Fix or remove it, then re-run: ${err.message}`);
      }
    }
    let rawtext = `module.exports.models = {
  schema: true,
  // 'safe' = never auto-migrate. Mongo is schemaless so no migration is needed,
  // and 'alter' can drop/recreate collections (data loss) -- especially with more
  // than one app instance pointed at the same database.
  migrate: 'safe',
  attributes: {
    createdAt: { type: 'number', autoCreatedAt: true },
    updatedAt: { type: 'number', autoUpdatedAt: true },
    id: { type: 'string', columnName: '_id' }
  },
  datastore: 'fogdb',
  cascadeOnDestroy: true,
  dataEncryptionKeys: {
    default: '${encKey}'
  }
};
`;
    // writeFileSync takes no callback: it throws. Catch it so a write failure
    // ends the install with the error instead of an uncaught exception.
    try {
      fs.writeFileSync(modelsCfg, rawtext);
    } catch (err) {
      status.stop();
      return next(err);
    }

    /**
     * local.js
     */
    const ds = payload.datastores.fogdb;
    // A re-run keeps a custom.pkiDir that the old local.js set (the CA keys are
    // there). Read it before the write below replaces the file.
    let pkiOverride;
    try {
      pkiOverride = pki.overrideDir(config.appPath);
    } catch (err) {
      status.stop();
      return next(`config/local.js exists but cannot be read, so its pkiDir cannot be kept. Fix or remove it, then re-run: ${err.message}`);
    }
    payload.pkiDir = pkiOverride || pki.pkiDirFor(config.appPath);
    const pkiLines = pkiOverride ? `,
    pkiDir: '${jsStr(pkiOverride)}'` : '';
    // Only emit credentials when a username was provided. Emitting an empty (or
    // undefined) user+password makes sails-mongo attempt authentication and fail
    // against a no-auth Mongo with "Authentication failed".
    const credLines = ds.username
      ? `
      user: '${encodeURIComponent(ds.username)}',
      password: '${encodeURIComponent(ds.password || '')}',`
      : '';
    rawtext = `module.exports = {
  auth: {
    bcrypt: {
      rounds: 10
    },
    jwt: {
      secret: '${payload.auth.jwt.secret}',
      options: {
        expiresIn: '1d'
      },
      session: false,
      cookie: {
        maxAge: 24 * 1000 * 60 * 60,
        signed: true,
        //domain: '.fogserver.example.com',
        //httpOnly: true,
        //sameSite: true,
        //secure: true
      }
    },
  },
  // Session store: a per-install secret + Redis. Required for CSRF (the CSRF
  // token's secret lives in the session). The installer verified this URL.
  session: {
    secret: '${payload.session.secret}',
    adapter: '@sailshq/connect-redis',
    url: '${jsStr(payload.redisUrl)}'
  },
  // Sails accepts socket connections only from these origins, in every mode.
  // Production refuses to lift without the list. Re-run npm run setup to change it.
  sockets: {
    onlyAllowOrigins: [${payload.server.origins.map((o) => `'${jsStr(o)}'`).join(', ')}]
  },
  custom: {
    imageStorePath: '${jsStr(payload.server.imageStorePath)}'${pkiLines}
  },
  datastores: {
    fogdb: {
      adapter: 'sails-mongo',
      host: '${encodeURIComponent(ds.host)}',
      port: ${ds.port},${credLines}
      database: '${encodeURIComponent(ds.database)}'
    }
  },
  schema: 1
};
`;
    try {
      fs.writeFileSync(localCfg, rawtext);
    } catch (err) {
      status.stop();
      return next(err);
    }
    // Stop the spinner here. Left running, it printed over every later step.
    status.stop();
    // Printed after the spinner stops, so the two do not share a line.
    if (keptKey) console.log('Kept the existing data encryption key from config/models.js');
    console.log('Configuration saved');
    next();
  },
  // Apply Schema Configuration
  (next) => {
    header.printSection('Applying database schema');
    var status = new Spinner('Applying database schema');
    status.start();
    schema.generate(payload.admin.password, payload.admin.email, (err, result) => {
      status.stop();
      if (err) return next(`Failed to apply database schema: ${err}`);
      payload.adminCreated = result.adminCreated;
      console.log('Database schema applied');
      next();
    });
  },
  // The fog-agent certificate authorities. They need local.js (written above)
  // for a pkiDir override. Files that already exist are left as they are.
  (next) => {
    header.printSection('Agent certificate authority');
    // Sails is loaded by the schema step, so the Setting model is ready. A
    // recorded root that pki/ no longer has stops setup unless --new-agent-root.
    pki.setupPki({
      pkiDir: payload.pkiDir,
      newRoot: process.argv.includes('--new-agent-root'),
      settings: sails.models.setting,
      log: console.log,
      command: 'setup'
    }).then(
      () => {
        console.log(`Agent CA files are in ${payload.pkiDir}`);
        console.log('The CA keys there must be readable only by the user that runs fog-node.');
        next();
      },
      (err) => {
        // The guard errors carry the full message: show it as is.
        if (pki.isRootError(err)) return next(err.message);
        next(`Failed to make the agent CA files: ${err && err.message ? err.message : err}`);
      }
    );
  },
  // Optional sample/test data -- opt-in (default no), so production installs
  // stay clean unless the admin asks for it. Sails is already loaded by the
  // schema step above, so seedDemoData uses the models directly.
  (next) => {
    header.printSection('Sample / Test Data (optional)');
    inquire.getDemoSeedInfo((answers) => {
      if (!answers.seed) {
        console.log('Skipping sample data.');
        return next();
      }
      let status = new Spinner(`Seeding ${answers.hosts} sample hosts (this can take a moment)...`);
      status.start();
      seedDemo.seedDemoData({ numHosts: answers.hosts })
        .then((res) => {
          status.stop();
          console.log(`Sample data seeded: ${res.seededHosts} hosts (${res.totalHosts} total), ${res.images} images, ${res.storageGroups} storage groups.`);
          next();
        })
        .catch((err) => {
          status.stop();
          next(`Failed to seed sample data: ${err && err.message ? err.message : err}`);
        });
    });
  },
  // Inform user of their username/password setting
  (next) => {
    header.printSection('Setup Complete');
    console.log(`Configuration and installation are now complete`);
    console.log(`You will likely want to configure a DNS name for this server`);
    header.printSection('Login Information');
    console.log('To login, you may use either the username or the email');
    console.log(`URL: ${payload.server.origins.join(', ')}`);
    console.log('Browse with one of these URLs. Sockets refuse connections from any other address.');
    console.log('Start fog-node with: npm start');
    console.log('Username: Administrator');
    // On a re-run against an existing database the Administrator already
    // exists and keeps its old email and password. Say so, instead of
    // printing the new values, which would not work.
    if (payload.adminCreated) {
      console.log(`Email: ${payload.admin.email}`);
      console.log(`Password: ${payload.admin.password}`);
    } else {
      console.log(chalk.yellow('The Administrator account already existed. Its email and password did not change.'));
    }
    next();
  }
], (err) => {
  if (err) console.log(chalk.bgRed(err));
  COMPLETED = true;
  // A failed install exits 1, so a script or CI run can see the failure.
  process.exit(err ? 1 : 0);
});
(function wait() {
  if (!COMPLETED) setTimeout(wait, 1000);
})();
