const MongoClient = require('mongodb').MongoClient;

// The URL of a datastore in the installer shape: {host, port, database, user,
// password} (tools/setup/index.js). The installer writes each value
// URL-encoded, and sails-mongo puts them in its URL as given
// (normalize-datastore-config), so this does the same, with the same rules: a
// port only when set, and credentials only when a username was provided. An
// empty auth part makes the driver attempt authentication with blank
// credentials, which fails against a MongoDB with no authentication.
function datastoreUrl(ds) {
  const auth = ds.user ? `${ds.user}${ds.password ? ':' + ds.password : ''}@` : '';
  return `mongodb://${auth}${ds.host}${ds.port ? ':' + ds.port : ''}/${ds.database}`;
}

module.exports = {
  datastoreUrl,
  // `datastore` is a fogdb datastore object, as config/local.js holds it:
  // {url} as `npm run setup:dev` writes it, or {host, port, database, user,
  // password} as the installer writes it (tools/setup/index.js). The callback
  // gets the MongoClient; client.db() is the database.
  connect: (datastore, next) => {
    let dbUri = datastore.url || datastoreUrl(datastore);
    let opts = {
      useUnifiedTopology: true,
      useNewUrlParser: true,
      // The driver default is 30 s. A server that answers at all is selected
      // in milliseconds, so a wrong host or port fails in 5 s instead.
      serverSelectionTimeoutMS: 5000
    };
    MongoClient.connect(dbUri, opts, (err, client) => {
      if (err) return next(err);
      next(null, client);
    });
  },
  verifyConnection: (datastore, next) => {
    module.exports.connect(datastore, (err, client) => {
      if (err) return next(err);
      client.close();
      next();
    });
  }
};
