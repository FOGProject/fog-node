module.exports = {
  create: (db, name, value, next) => {
    db.collection('setting').insert({name,value}, (err) => {
      if (err) return next(err);
      next();
    });
  },
  get: (db, name, next) => {
    db.collection('setting').findOne({name}, (err, setting) => {
      if (err) return next(err);
      // No such setting: undefined, which the caller reports, not a TypeError.
      next(null, setting ? setting.value : undefined);
    });
  },
  set: (db, name, value, next) => {
    db.collection('setting').findOneAndUpdate({name}, {$set: {value}}, (err, setting) => {
      if (err) return next(err);
      next(null, setting.value);
    });
  },
  destroy: (db, name, next) => {
    db.collection('setting').findOneAndDelete({name}, (err) => {
      if (err) return next(err);
      next();
    });
  }
};
