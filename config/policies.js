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
  'general/create':        ['isLoggedIn','isAuthenticated','apiCsrfGuard','create'],
  'general/update':        ['isLoggedIn','isAuthenticated','apiCsrfGuard','update'],
  'general/destroy':       ['isLoggedIn','isAuthenticated','apiCsrfGuard','destroy'],
  'general/datatable':     ['isLoggedIn','isAuthenticated','read'],
  'general/columns':       ['isLoggedIn','isAuthenticated','read'],
  // save derives the model from the URL and checks create permission itself
  'general/save':          ['isLoggedIn','isAuthenticated'],


  // Host bulk actions (checks host update permission itself)
  'host/bulk':             ['isLoggedIn','isAuthenticated'],

  // Image Policies
  'image/capture':         ['isLoggedIn','isAuthenticated', 'image/capture'],
  'image/deploy':          ['isLoggedIn','isAuthenticated', 'image/deploy'],

  // Role Policies
  'role/assign':           ['isLoggedIn','isAuthenticated', 'role/assign'],
  'role/unassign':         ['isLoggedIn','isAuthenticated', 'role/unassign'],

  // User Policies
  'user/listme':           ['isLoggedIn','isAuthenticated'],
  // Credential management (each action self-checks permission + refuses API-token auth)
  'user/reset-password':     ['isLoggedIn','isAuthenticated'],
  'user/reset-api-token':    ['isLoggedIn','isAuthenticated'],
  'account/change-password': ['isLoggedIn','isAuthenticated'],
  'account/reset-api-token': ['isLoggedIn','isAuthenticated'],

  // Auth Policies
  'auth/login':            'isNotLoggedIn',
  'auth/logout':           ['isLoggedIn','isAuthenticated'],
  'auth/token':            ['isLoggedIn','isAuthenticated'],

  'pages/login':           'isNotLoggedIn',

  '*':                     ['isLoggedIn','isAuthenticated','stripApiTokenCredentials'],

  // Allow API Backend to work
  'api':                   true,

  // CSRF token endpoint -- public, so the login form can obtain a token pre-auth
  'security/grant-csrf-token': true,

  // iPXE boot script is public (PXE machines have no session)
  'boot':                  true,

  // System info
  'system/info':           true,
  'system/bandwidth':      true,
  'task-history':          ['isLoggedIn','isAuthenticated']
};
