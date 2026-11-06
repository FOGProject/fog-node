/**
 * User.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
const bcrypt = require('bcryptjs');
const flatten = require('flat');
const filterPermissions = function(permissions) {
  if (!permissions) permissions = {};
  let toValidate = flatten(permissions);
  // Filter out unknown permissions
  for (var i = 0; i < toValidate.length; i++) {
    if (!_.get(sails.config.permissions, toValidate[i])) _.set(permissions, toValidate[i], undefined);
  }
  // Merge in the default permissions, ensuring all values are set
  // Note that the 'right' object being merged overrides any values set
  // by the 'left' object.
  return _.extend(sails.config.permissions, permissions);
};
// See the matching note in api/models/Role.js: `mapFn` is a value transform,
// not a continuation, and was named `cb` only by convention.
const deepMap = function(obj, mapFn) {
  let out = {};
  Object.keys(obj).forEach((k) => {
    let val;
    if (obj[k] !== null && typeof obj[k] === 'object') {
      val = deepMap(obj[k], mapFn);
    } else {
      val = mapFn(obj[k], k);
    }
    out[k] = val;
  });
  return out;
};
module.exports = {
  attributes: {
    username: {
      type: 'string',
      required: true,
      unique: true
    },
    description: {
      type: 'string'
    },
    displayName: {
      type: 'string'
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
    apiTokenHash: {
      type: 'string',
      allowNull: true,
      description: 'SHA-256 of the user\'s API bearer token. The token itself is never stored.'
    },
    roles: {
      collection: 'role',
      via: 'users'
    }
  },
  customToJSON: function() {
    concatRoles = function(roles, models) {
      let permissions = {};
      if (roles === undefined) return {};
      if (models === undefined) models = Object.keys(sails.models);
      for (let i = 0; i < models.length; i++) {
        for (let j = 0; j < roles.length; j++) {
          if (roles[j].isAdmin) {
            roles[j].permissions = deepMap(sails.config.permissions, () => {
              return true;
            });
          } else {
            roles[j].permissions = filterPermissions(roles[j].permissions);
          }
        }
      }
      for (let i = 0; i < roles.length; i++) {
        permissions = _.extend(permissions, roles[i].permissions);
      }
      return permissions;
    };
    this.permissions = concatRoles(this.roles);
    return _.omit(this, ['password','roles','apiTokenHash']);
  },
  beforeCreate: function(values, next) {
    bcrypt.hash(values.password, sails.config.auth.bcrypt.rounds, (err, hash) => {
      if (err) return next(err);
      values.password = hash;
      next();
    });
  },
  beforeUpdate: function(values, next) {
    if (!values.hasOwnProperty('password')) return next();
    bcrypt.hash(values.password, sails.config.auth.bcrypt.rounds, (err, hash) => {
      if (err) return next(err);
      values.password = hash;
      next();
    });
  },
  // Delete the destroyed users' preferences (UserPref). Not afterDestroy: that
  // fires only with fetch: true, and tools/setup/seed-dev.js destroys without
  // it. The criteria can match many users, so resolve them to ids first.
  beforeDestroy: function(criteria, next) {
    User.find({where: criteria.where, select: ['id']})
      .then((users) => users.length ? UserPref.destroy({user: {in: users.map((u) => u.id)}}) : null)
      .then(() => next(), next);
  }
};
