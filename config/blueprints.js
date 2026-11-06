/**
 * Blueprint API Configuration
 * (sails.config.blueprints)
 *
 * For background on the blueprint API in Sails, check out:
 * https://sailsjs.com/docs/reference/blueprint-api
 *
 * For details and more available options, see:
 * https://sailsjs.com/config/blueprints
 */

module.exports.blueprints = {

  /***************************************************************************
  *                                                                          *
  * Automatically expose implicit routes for every action in your app?       *
  *                                                                          *
  ***************************************************************************/

  // Off. With `true`, Sails binds every action at `/<identity>` for every verb,
  // beside its explicit route. CSRF skips GET, so a crafted link ran a mutation
  // with the visitor's session (for example GET /user/reset-password?id=…).
  // Every action is reachable only through config/routes.js or a plugin route.
  // test/route/no-action-blueprints.test.js fails if one is bound here again.
  actions: false,


  /***************************************************************************
  *                                                                          *
  * Automatically expose RESTful routes for your models?                     *
  *                                                                          *
  ***************************************************************************/

  rest: false,


  /***************************************************************************
  *                                                                          *
  * Automatically expose CRUD "shortcut" routes to GET requests?             *
  * (These are enabled by default in development only.)                      *
  *                                                                          *
  ***************************************************************************/

  shortcuts: false,

};
