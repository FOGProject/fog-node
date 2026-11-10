/**
 * The indexes of the audit trail. The models use `migrate: 'safe'`, so the ORM
 * creates no index. config/bootstrap.js runs this at each lift. createIndex
 * does nothing when the index exists, so a new install and an upgraded install
 * both get them (the pattern of api/helpers/agent/ensure-indexes.js). No schema
 * revision.
 *
 *   createdAt, createdBy, correlationId, outcome  plain
 *   {subjectType, subjectId}                      plain, compound
 *
 * No index is unique: 1.6 notes that a unique key silently merges identical
 * rows, and two identical audit rows are two events.
 *
 * Usage: await sails.helpers.audit.ensureIndexes()
 */
module.exports = {
  friendlyName: 'Ensure the audit indexes',
  description: 'Create the AuditLog indexes when they do not exist.',
  exits: {
    success: {description: 'The indexes exist.'}
  },
  fn: async function () {
    const model = sails.models.auditlog;
    const collection = sails.getDatastore(model.datastore).manager.collection(model.tableName);
    await collection.createIndex({createdAt: 1});
    await collection.createIndex({createdBy: 1});
    await collection.createIndex({correlationId: 1});
    await collection.createIndex({outcome: 1});
    await collection.createIndex({subjectType: 1, subjectId: 1});
  }
};
