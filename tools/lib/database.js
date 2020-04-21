const MongoClient = require('mongodb').MongoClient;

module.exports = {
  connect: (host, port, database, username, password, next) => {
    let db_uri = 'mongodb://';
    if (username) db_uri += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
    db_uri += `${encodeURIComponent(host)}:${port}/${encodeURIComponent(database)}`;
    MongoClient.connect(db_uri, (err, db) => {
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
