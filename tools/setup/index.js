const chalk = require('chalk'),
  fs = require('fs'),
  path = require('path'),
  header = require('../lib/header'),
  config = require('../lib/config'),
  cfgPath = path.join(config.appPath, 'config'),
  httpCfg = path.join(cfgPath, 'http.js'),
  modelsCfg = path.join(cfgPath, 'models.js'),
  localCfg = path.join(cfgPath, 'local.js'),
  inquire = require('./lib/inquire'),
  schema = require('./lib/schema'),
  seedDemo = require('./seed-demo'),
  secure = require('./lib/secure'),
  async = require('async'),
  CLI = require('clui'),
  Spinner = CLI.Spinner,
  welcome = `Welcome to the FOG installer.\nYou will be guided through configuring your new server for production.`;

var COMPLETED = false,
  payload = {};

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
    }
    status.stop();
    console.log('JWT secret generated');
    next();
  },
  // Save configuration
  (next) => {
    header.printSection('Applying Configuration');
    let status = new Spinner('Saving configuration');
    status.start();

    /**
     * sails http.js config.
     */
    let rawtext = `const passport = require('passport');

// Only run passport when a session exists. Sails skips session for asset
// requests, so running passport.session() on those throws "Login sessions
// require session support" and turns every CSS/JS asset into a 500.
const onlyWithSession = (middleware) => (req, res, next) =>
  req.session ? middleware(req, res, next) : next();

module.exports.http = {
  middleware: {
    passportInit: onlyWithSession(passport.initialize()),
    passportSession: onlyWithSession(passport.session()),
    order: [
      'cookieParser',
      'session',
      'passportInit',
      'passportSession',
      'bodyParser',
      'compress',
      'poweredBy',
      'router',
      'www',
      'favicon'
    ]
  }
};`;
    fs.writeFileSync(httpCfg, rawtext, (err) => {
      if (err) return next(err);
    });

    /**
     * models.js
     */
    rawtext = `module.exports.models = {
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
    default: '${secure.generateSecret()}'
  }
};`;
    fs.writeFileSync(modelsCfg, rawtext, (err) => {
      if (err) return next(err);
    });

    /**
     * local.js
     */
    const ds = payload.datastores.fogdb;
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
  // token's secret lives in the session). Point url at your Redis.
  session: {
    secret: '${payload.session.secret}',
    adapter: '@sailshq/connect-redis',
    url: 'redis://127.0.0.1:6379/0'
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
};`;
    fs.writeFileSync(localCfg, rawtext, (err) => {
      if (err) return next(err);
    });
    next();
  },
  // Apply Schema Configuration
  (next) => {
    header.printSection('Applying database schema');
    var status = new Spinner('Applying database schema');
    status.start();
    schema.generate(payload.admin.password, payload.admin.email, (err) => {
      status.stop();
      if (err) return next(`Failed to apply database schema: ${err}`);
      console.log('Database schema applied');
      next();
    });
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
    console.log('URL: http://localhost:1337');
    console.log('Username: Administrator');
    console.log(`Email: ${payload.admin.email}`);
    console.log(`Password: ${payload.admin.password}`);
    next();
  }
], (err, result) => {
  if (err) console.log(chalk.bgRed(err));
  COMPLETED = true;
  process.exit();
});
(function wait() {
  if (!COMPLETED) setTimeout(wait, 1000);
})();
