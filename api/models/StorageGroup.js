/**
 * StorageGroup.js
 *
 * @description :: A logical group of storage nodes. Mirrors FOG 1.x `nfsGroups`.
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
    storageNodes: {
      collection: 'storagenode',
      via: 'storagegroup'
    }
  }
};
