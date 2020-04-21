/**
 * Role.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
const flatten = require('flat'),
  filterPermissions = function(permissions) {
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
  },
  deepMap = function(obj, cb) {
    let out = {};

    Object.keys(obj).forEach(function(k) {
      let val;
      if (obj[k] !== null && typeof obj[k] === 'object') {
        val = deepMap(obj[k], cb);
      } else {
        val = cb(obj[k], k);
      }

      out[k] = val;
    });

    return out;
  };
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
  beforeCreate: function(values, next) {
    if (values.isAdmin) {
      values.permissions = deepMap(sails.config.permissions, function(v, k) {
        return true;
      });
    } else {
      values.permissions = filterPermissions(values.permissions);
    }

    next();
  },
  beforeUpdate: function(values, next) {
    if (values.hasOwnProperty('permissions') && !values.isAdmin) {
      values.permissions = filterPermissions(values.permissions);
    } else if (values.isAdmin) {
      values.permissions = deepMap(sails.config.permissions, function(v, k) {
        return true;
      });
    }

    next();
  }
};
