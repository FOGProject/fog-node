/**
 * User.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
const bcrypt = require('bcryptjs');
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
    // req.user.permissions, which every policy reads: the union of the user's
    // roles (api/helpers/permissions/resolve.js). It is {} when the roles
    // are not populated.
    this.permissions = this.roles === undefined ? {} : sails.helpers.permissions.resolve.with({roles: this.roles});
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
