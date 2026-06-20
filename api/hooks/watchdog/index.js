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
      // NOTE: the iteratee must be a plain (non-async) function. Under async@3
      // an async/promise-returning iteratee is not passed the `next` callback,
      // which made `setTimeout(next, delay)` throw (next === undefined).
      async.forever(
        (next) => {
          sails.emit('fog:watchdog:tick');
          setTimeout(next, delay);
        },
        (err) => {
          running = false;
          sails.emit('fog:watchdog:crash');
          sails.log.error(`Watchdog crashed, err: ${err}`);
          defineWatchdogHook(sails);
        }
      );
    }
  };
};
