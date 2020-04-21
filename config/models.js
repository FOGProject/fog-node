module.exports.models = {
  schema: true,
  migrate: 'alter',
  attributes: {
    createdAt: { type: 'number', autoCreatedAt: true },
    updatedAt: { type: 'number', autoUpdatedAt: true },
    id: { type: 'string', columnName: '_id' }
  },
  datastore: 'fogdb',
  cascadeOnDestroy: true,
  dataEncryptionKeys: {
    default: 'aca76a3a84019cab3b2537459a39e73205372f50481979f29ce023e8529b473c'
  }
};