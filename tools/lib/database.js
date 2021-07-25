const MongoClient = require('mongodb').MongoClient;

module.exports = {
  connect: (host, port, database, username, password, next) => {
    let db_uri = 'mongodb://';
    db_uri += `${host}:${port}/${database}`;
    opts = {
      auth: {
        user: username,
        password: password
      },
      useUnifiedTopology: true,
      useNewUrlParser: true
    }
    if (!password) {
      delete opts.password;
    }
    if (!username) {
      delete opts.username;
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
