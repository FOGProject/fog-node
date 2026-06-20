/**
 * Host.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
module.exports = {
  attributes: {
    name: {
      type: 'string',
      required: true,
      maxLength: 63,
      regex: /^[a-z\d]([a-z\d\-]{0,61}[a-z\d])?(\.[a-z\d]([a-z\d\-]{0,61}[a-z\d])?)*$/i,
      unique: true
    },
    description: {
      type: 'string'
    },
    // NOTE: not `unique` and not `isUUID`. A unique index on an optional field
    // makes every host created without a guid collide (empty/null guids are
    // "equal"), which 409s the 2nd host; and isUUID rejects the empty string on
    // edit. The hardware guid is set/validated at registration time instead.
    guid: {
      type: 'string'
    },
    macs: {
      type: 'json'
    },
    // --- FOG 1.x `hosts` scalar fields (friendly names; snake_case
    //     security fields normalised to camelCase) ---
    ip: {
      type: 'string'
    },
    building: {
      type: 'number',
      isInteger: true,
      defaultsTo: 0
    },
    deployed: {
      type: 'string'
    },
    createdBy: {
      type: 'string'
    },
    useAD: {
      type: 'boolean',
      defaultsTo: false
    },
    ADDomain: {
      type: 'string'
    },
    ADOU: {
      type: 'string'
    },
    ADUser: {
      type: 'string'
    },
    ADPass: {
      type: 'string'
    },
    ADPassLegacy: {
      type: 'string'
    },
    productKey: {
      type: 'string'
    },
    printerLevel: {
      type: 'number',
      isInteger: true,
      defaultsTo: 0
    },
    kernelArgs: {
      type: 'string'
    },
    kernel: {
      type: 'string'
    },
    kernelDevice: {
      type: 'string'
    },
    init: {
      type: 'string'
    },
    pending: {
      type: 'boolean',
      defaultsTo: false
    },
    pubKey: {
      type: 'string'
    },
    secToken: {
      type: 'string'
    },
    secTime: {
      type: 'string'
    },
    pingstatus: {
      type: 'string'
    },
    biosexit: {
      type: 'string'
    },
    efiexit: {
      type: 'string'
    },
    enforce: {
      type: 'boolean',
      defaultsTo: false
    },
    token: {
      type: 'string'
    },
    tokenlock: {
      type: 'boolean',
      defaultsTo: false
    },
    image: {
      model: 'image'
    },
    groups: {
      collection: 'group',
      via: 'hosts'
    },
    workflows: {
      collection: 'workflow',
      via: 'host'
    },
    snapins: {
      collection: 'snapin',
      via: 'hosts',
      dominant: true
    },
    printers: {
      collection: 'printer',
      via: 'hosts',
      dominant: true
    },
    defaultPrinter: {
      model: 'printer'
    }
  }
};
