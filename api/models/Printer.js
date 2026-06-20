/**
 * Printer.js
 *
 * @description :: A printer definition that can be assigned to hosts/groups.
 *                 Mirrors FOG 1.x `printers`.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
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
    port: {
      type: 'string'
    },
    file: {
      type: 'string'
    },
    // NOTE: named `printerModel`, not `model`, on purpose. The generic CRUD
    // routes are `/api/v1/:model`, so `req.allParams().model` is the route's
    // model identity and would clobber a body field literally named `model`.
    printerModel: {
      type: 'string'
    },
    config: {
      type: 'string'
    },
    configFile: {
      type: 'string'
    },
    ip: {
      type: 'string'
    }
  }
};
