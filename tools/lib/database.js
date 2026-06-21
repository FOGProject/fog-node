const MongoClient = require('mongodb').MongoClient;

module.exports = {
  connect: (host, port, database, username, password, next) => {
    let db_uri = 'mongodb://';
    db_uri += `${host}:${port}/${database}`;
    let opts = {
      useUnifiedTopology: true,
      useNewUrlParser: true
    };
    // Only send credentials when a username was actually provided. Passing an
    // empty auth block makes the driver attempt authentication with blank
    // credentials and fail with "No AuthProvider for default defined".
    if (username) {
      opts.auth = {
        user: username,
        password: password
      };
    }
    MongoClient.connect(db_uri, opts, (err, db) => {
      if (err) return next(err);
      next(null, db);
    });
  },
  verifyConnection: (host, port, database, username, password, next) => {
    module.exports.connect(host, port, database, username, password, (err, db) => {
      if (err) return next(err);
      db.close();
      next();
    });
  }
};
