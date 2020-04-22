module.exports = {
  up: (db, logger, next) => {
    db.collection('role').update({}, {$set: {isCool: true}}, next);
  },
  down: (db, logger, next) => {
    db.collection('role').update({}, {$set: {isCool: false}}, next);
  },
  _meta: {
    description: 'Add an isCool flag to the Role model'
  }
};
