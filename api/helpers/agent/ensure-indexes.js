/**
 * The indexes that fog-agent enrollment needs. The models use `migrate: 'safe'`,
 * so the ORM creates no index and `unique: true` enforces nothing by itself.
 * config/bootstrap.js runs this at each lift. createIndex does nothing when the
 * index exists, so a new install and an upgraded install both get them (the
 * Group precedent: api/helpers/group/ensure-index.js). No schema revision.
 *
 *   agentenrollment.fingerprint  unique: one row per key
 *   agentenrolltoken.hash        unique: one row per token
 *   host.agentFingerprint        plain: the lookup of a host by its key
 *   host.agentId                 unique, partial on agentId > 0. Waterline
 *                                writes 0 for an omitted number, so 0 must not
 *                                be indexed, or a second host with no agent
 *                                would collide.
 *
 * Usage: await sails.helpers.agent.ensureIndexes()
 */
module.exports = {
  friendlyName: 'Ensure the agent indexes',
  description: 'Create the fog-agent enrollment indexes when they do not exist.',
  exits: {
    success: {description: 'The indexes exist.'}
  },
  fn: async function () {
    const collection = (model) => sails.getDatastore(model.datastore).manager.collection(model.tableName);
    await collection(sails.models.agentenrollment).createIndex({fingerprint: 1}, {unique: true});
    await collection(sails.models.agentenrolltoken).createIndex({hash: 1}, {unique: true});
    await collection(sails.models.host).createIndex({agentFingerprint: 1});
    await collection(sails.models.host).createIndex({agentId: 1}, {unique: true, partialFilterExpression: {agentId: {$gt: 0}}});
  }
};
