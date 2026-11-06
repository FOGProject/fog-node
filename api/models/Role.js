/**
 * Role.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
// A role's permissions come from api/helpers/permissions/resolve.js. They
// have the shape of sails.config.permissions. A leaf is true only where the
// role grants it. An admin role gets every leaf true. The helper never
// writes to the shared defaults (issue #168).
module.exports = {
  attributes: {
    name: {
      type: 'string',
      required: true,
      unique: true
    },
    description: {
      type: 'string'
    },
    users: {
      collection: 'user',
      via: 'roles',
      dominant: true
    },
    isAdmin: {
      type: 'boolean',
      defaultsTo: false
    },
    permissions: {
      type: 'json',
      required: true
    }
  },
  customToJSON: function() {
    this.permissions = sails.helpers.permissions.resolve.with({roles: [this]});
    return this;
  },
  beforeCreate: function(values, next) {
    values.permissions = sails.helpers.permissions.resolve.with({roles: [values]});
    next();
  },
  beforeUpdate: function(values, next) {
    // Only an update that carries permissions, or that makes the role an
    // admin role, rewrites them. A partial update such as {description: 'x'}
    // leaves the stored permissions alone. The edit page posts isAdmin on
    // every save, so a check for the key would reset them on each edit.
    // Known gap: {isAdmin: false} alone keeps the stored tree. For a former
    // admin role, that tree is all true.
    if (values.hasOwnProperty('permissions') || values.isAdmin) {
      values.permissions = sails.helpers.permissions.resolve.with({roles: [values]});
    }
    next();
  }
};
