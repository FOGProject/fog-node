/**
 * Non-interactive development setup for fog-node.
 *
 * Mirrors `tools/setup/index.js` but takes no prompts: it writes the
 * git-ignored `config/local.js` and `config/models.js` with sane localhost
 * defaults (overridable via env vars) and seeds the Administrator account.
 *
 * Intended to pair with the bundled `docker-compose.yml` Mongo so a fresh
 * clone can be lifted with:
 *
 *   docker compose up -d        # or: podman compose up -d
 *   npm run setup:dev
 *   npm start                   # or: node app.js
 *
 * Env overrides:
 *   FOG_DEV_DB_HOST   (default 127.0.0.1)
 *   FOG_DEV_DB_PORT   (default 27017)
 *   FOG_DEV_DB_NAME   (default fog)
 *   FOG_DEV_DB_USER   (default <none>)
 *   FOG_DEV_DB_PASS   (default <none>)
 *   FOG_DEV_ADMIN_EMAIL    (default admin@example.com)
 *   FOG_DEV_ADMIN_PASSWORD (default fogadmin1 -- must be >= 8 chars)
 *
 * This is for LOCAL DEVELOPMENT ONLY. For a real install use
 * `node tools/setup/index.js`.
 */
const fs = require('fs'),
  path = require('path'),
  config = require('../lib/config'),
  secure = require('./lib/secure'),
  schema = require('./lib/schema'),
  cfgPath = path.join(config.appPath, 'config'),
  localCfg = path.join(cfgPath, 'local.js'),
  modelsCfg = path.join(cfgPath, 'models.js'),
  env = process.env,
  db = {
    host: env.FOG_DEV_DB_HOST || '127.0.0.1',
    port: env.FOG_DEV_DB_PORT || '27017',
    name: env.FOG_DEV_DB_NAME || 'fog',
    user: env.FOG_DEV_DB_USER || '',
    pass: env.FOG_DEV_DB_PASS || ''
  },
  admin = {
    email: env.FOG_DEV_ADMIN_EMAIL || 'admin@example.com',
    password: env.FOG_DEV_ADMIN_PASSWORD || 'fogadmin1'
  };

function mongoUrl() {
  let auth = '';
  if (db.user.length) {
    auth = encodeURIComponent(db.user);
    if (db.pass.length) auth += ':' + encodeURIComponent(db.pass);
    auth += '@';
  }
  return `mongodb://${auth}${db.host}:${db.port}/${encodeURIComponent(db.name)}`;
}

function writeIfMissing(file, label, contents) {
  if (fs.existsSync(file)) {
    console.log(`${label} already exists -- leaving it untouched (delete it to regenerate).`);
    return;
  }
  fs.writeFileSync(file, contents);
  console.log(`Wrote ${label}.`);
}

if (admin.password.length < 8) {
  console.error('FOG_DEV_ADMIN_PASSWORD must be at least 8 characters.');
  process.exit(1);
}

writeIfMissing(localCfg, 'config/local.js', `module.exports = {
  auth: {
    bcrypt: {
      rounds: 10
    },
    jwt: {
      secret: '${secure.generateSecret()}',
      options: {
        expiresIn: '1d'
      },
      session: false,
      cookie: {
        maxAge: 24 * 1000 * 60 * 60,
        signed: true
      }
    }
  },
  datastores: {
    fogdb: {
      adapter: 'sails-mongo',
      url: '${mongoUrl()}'
    }
  },
  schema: 1
};
`);

writeIfMissing(modelsCfg, 'config/models.js', `module.exports.models = {
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
};
`);

console.log('Seeding Administrator account...');
schema.generate(admin.password, admin.email, (err) => {
  if (err) {
    console.error(`Failed to seed database: ${err}`);
    process.exit(1);
  }
  console.log('');
  console.log('Development setup complete.');
  console.log('  URL:      http://localhost:1337');
  console.log('  Username: Administrator');
  console.log(`  Email:    ${admin.email}`);
  console.log(`  Password: ${admin.password}`);
  console.log('');
  console.log('Start the server with `npm start` (or `node app.js`).');
  process.exit(0);
});
