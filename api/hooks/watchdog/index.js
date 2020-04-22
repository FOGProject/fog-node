/**
 * watchdog hook
 *
 * @description :: A hook definition.  Extends Sails by adding shadow routes, implicit actions, and/or initialization logic.
 * @docs        :: https://sailsjs.com/docs/concepts/extending-sails/hooks
 */
const delay = 1 * 60 * 1000,
  async = require('async');
var running = false;
module.exports = function defineWatchdogHook(sails) {
  return {
    /**
     * Runs when this Sails app loads/lifts.
     */
    initialize: async function() {
      if (running) return;
      running = true;
      sails.log.info('Starting watchdog');
      sails.emit('fog:watchdog:start');
      async.forever(
        async (next) => {
          sails.emit('fog:watchdog:tick');
          setTimeout(next, delay);
        },
        async (err) => {
          running = false;
          sails.emit('fog:watchdog:crash');
          sails.log.error(`Watchdog crashed, err: ${err}`);
          defineWatchdogHook(sails);
        }
      );
    }
  };
};
