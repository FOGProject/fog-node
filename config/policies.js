/**
 * Policy Mappings
 * (sails.config.policies)
 *
 * Policies are simple functions which run **before** your actions.
 *
 * For more information on configuring policies, check out:
 * https://sailsjs.com/docs/concepts/policies
 */

module.exports.policies = {

  // General (common) action policies
  'general/list':          ['isLoggedIn','isAuthenticated','read'],
  'general/find':          ['isLoggedIn','isAuthenticated','read'],
  'general/search':        ['isLoggedIn','isAuthenticated','read'],
  'general/create':        ['isLoggedIn','isAuthenticated','create'],
  'general/update':        ['isLoggedIn','isAuthenticated','update'],
  'general/destroy':       ['isLoggedIn','isAuthenticated','destroy'],
  'general/datatable':     ['isLoggedIn','isAuthenticated','read'],
  'general/columns':       ['isLoggedIn','isAuthenticated','read'],


  // Group Policies
  'group/register':        ['isLoggedIn','isAuthenticated', 'group/register'],
  'group/unregister':      ['isLoggedIn','isAuthenticated', 'group/unregister'],

  // Image Policies
  'image/capture':         ['isLoggedIn','isAuthenticated', 'image/capture'],
  'image/deploy':          ['isLoggedIn','isAuthenticated', 'image/deploy'],

  // Role Policies
  'role/assign':           ['isLoggedIn','isAuthenticated', 'role/assign'],
  'role/unassign':         ['isLoggedIn','isAuthenticated', 'role/unassign'],

  // User Policies
  'user/listme':           ['isLoggedIn','isAuthenticated'],

  // Auth Policies
  'auth/login':            'isNotLoggedIn',
  'auth/logout':           ['isLoggedIn','isAuthenticated'],
  'auth/token':            ['isLoggedIn','isAuthenticated'],

  'pages/login':           'isNotLoggedIn',

  '*':                     ['isLoggedIn','isAuthenticated'],

  // Allow API Backend to work
  'api':                   true,

  // System info
  'system/info':           true
};
