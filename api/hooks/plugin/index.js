/**
 * plugin hook
 *
 * @description :: A hook definition.  Extends Sails by adding shadow routes, implicit actions, and/or initialization logic.
 * @docs        :: https://sailsjs.com/docs/concepts/extending-sails/hooks
 */

module.exports = function definePluginHook(sails) {
  return {
    /**
     * Runs when this Sails app loads/lifts.
     */
    initialize: async function() {
      sails.log.info('Initializing Plugins');
      await sails.helpers.plugin.scanPlugins();
    }
  };
};
