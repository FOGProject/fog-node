/**
 * User.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
const bcrypt = require('bcryptjs'),
  hashPW = function(password, next) {
    bcrypt.hash(password, sails.config.auth.bcrypt.rounds, function(err, hash) {
      if (err) return next(err);
      next(null, hash);
    });
  };
module.exports = {
  attributes: {
    username: {
      type: 'string',
      required: true,
      unique: true
    },
    email: {
      type: 'string',
      required: true,
      unique: true,
      isEmail: true
    },
    password: {
      type: 'string',
      required: true,
      minLength: 8
    },
    roles: {
      collection: 'role',
      via: 'users'
    }
  },
  customToJSON: function() {
    concatRoles = function(roles) {
      let permissions = {};
      if (roles === undefined) return {};
      for (var i = 0; i < roles.length; i++) {
        permissions = _.extend(permissions, roles[i].permissions);
      }
      return permissions;
    };
    this.permissions = concatRoles(this.roles);
    return _.omit(this, ['password']);
  },
  comparePassword: function(candidatePassword, next) {
    bcrypt.compare(candidatePassword, this.password, (err, isMatch) => {
      if (err) return next(err);
      next(null, isMatch);
    });
  },
  beforeCreate: function(values, next) {
    hashPW(values.password, function(err, hash) {
      if (err) return next(err);
      values.password = hash;
      next();
    });
  },
  beforeUpdate: function(values, next) {
    if (!values.hasOwnProperty('password')) return next();
    hashPW(values.password, function(err, hash) {
      if (err) return next(err);
      values.password = hash;
      next();
    });
  }
};
