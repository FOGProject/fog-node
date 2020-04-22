const chalk = require('chalk'),
  fs = require('fs'),
  path = require('path'),
  header = require('../lib/header'),
  config = require('../lib/config'),
  cfgPath = path.join(config.appPath, 'config');
  httpCfg = path.join(cfgPath, 'http.js'),
  modelsCfg = path.join(cfgPath, 'models.js'),
  localCfg = path.join(cfgPath, 'local.js'),
  inquire = require('./lib/inquire'),
  schema = require('./lib/schema'),
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
  // Web Config
  (next) => {
    header.printSection('Webserver Configuration');
    inquire.getWebserverInfo((answers) => {
      payload.port = answers.port;
      delete answers.port;
      payload.webserver = answers;
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
  // Secure Keypair
  (next) => {
    header.printSection('Generating Keypair');
    var status = new Spinner('Generating key pair');
    status.start();
    secure.generateKeypair((err, keypair) => {
      status.stop();
      if (err) return next(`Failed to generate keypair: ${err}`);
      console.log('Keypair generated');
      payload.defaultKey = keypair;
      next();
    });
  },
  // Save configuration
  (next) => {
    header.printSection('Applying Configuration');
    let status = new Spinner('Saving configuration');
    status.start();

    /**
     * sails http.js config.
     */
    let rawtext = `module.exports.http = {
  middleware: {
  passportInit: require('passport').initialize(),
  passportSession: require('passport').session(),
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
  migrate: 'alter',
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
  datastores: {
    fogdb: {
      adapter: 'sails-mongo',
      host: '${payload.datastores.fogdb.host}',
      port: ${payload.datastores.fogdb.port},
      user: '${payload.datastores.fogdb.username}',
      password: '${payload.datastores.fogdb.password}',
      database: '${payload.datastores.fogdb.database}'
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
