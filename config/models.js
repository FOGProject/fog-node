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
    default: '92f36ae8d6ef7296214f4c5186c8a3bb9d17451b9c5d26ce264cb4f596d0049f'
  }
};