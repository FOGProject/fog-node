/**
 * Seed Function
 * (sails.config.bootstrap)
 *
 * A function that runs just before your Sails app gets lifted.
 * > Need more flexibility?  You can also create a hook.
 *
 * For more information on seeding your app with fake data, check out:
 * https://sailsjs.com/config/bootstrap
 */

module.exports.bootstrap = async function() {

  // The ?v= value on the production bundle links (views/layouts/layout.ejs).
  // A production lift rebuilds the bundles, so each lift gets a new value and
  // browsers fetch the new bundle despite production's one-year cache.
  sails.config.custom.assetStamp = Date.now().toString(36);

  // The unique, case-insensitive Group name index. `migrate: 'safe'` creates
  // no index, and createIndex does nothing when it exists.
  await sails.helpers.group.ensureIndex();

  // The fog-agent enrollment indexes (the unique fingerprint, token hash and
  // agentId), for the same reason.
  await sails.helpers.agent.ensureIndexes();

  // The audit trail indexes (createdAt, createdBy, correlationId, outcome and
  // the subject), for the same reason.
  await sails.helpers.audit.ensureIndexes();

  // By convention, this is a good place to set up fake data during development.
  //
  // For example:
  // ```
  // // Set up fake development data (or if we already have some, avast)
  // if (await User.count() > 0) {
  //   return;
  // }
  //
  // await User.createEach([
  //   { emailAddress: 'ry@example.com', fullName: 'Ryan Dahl', },
  //   { emailAddress: 'rachael@example.com', fullName: 'Rachael Shaw', },
  //   // etc.
  // ]);
  // ```
};
