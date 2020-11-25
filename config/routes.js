/**
 * Route Mappings
 * (sails.config.routes)
 *
 * Your routes tell Sails what to do each time it receives a request.
 *
 * For more information on configuring custom routes, check out:
 * https://sailsjs.com/anatomy/config/routes-js
 */

module.exports.routes = {

  /***************************************************************************
  *                                                                          *
  * Make the view located at `views/homepage.ejs` your home page.            *
  *                                                                          *
  * (Alternatively, remove this and add an `index.html` file in your         *
  * `assets` directory)                                                      *
  *                                                                          *
  ***************************************************************************/

  /***************************************************************************
  *                                                                          *
  * More custom routes here...                                               *
  * (See https://sailsjs.com/config/routes for examples.)                    *
  *                                                                          *
  * If a request to a URL doesn't match any of the routes in this file, it   *
  * is matched against "shadow routes" (e.g. blueprint routes).  If it does  *
  * not match any of those, it is matched against static assets.             *
  *                                                                          *
  ***************************************************************************/
  // Status API
  '/api/v1':                                 {action: 'api'},

  // Auth API
  'POST /api/v1/auth/token':                 {action: 'auth/token'},
  'POST /api/v1/auth/login':                 {action: 'auth/login'},
  'POST /api/v1/auth/logout':                {action: 'auth/logout'},

  // Group API
  'PUT /api/v1/group/:id/register':          {action: 'group/register'},
  'PUT /api/v1/group/:id/unregister':        {action: 'group/unregister'},

  // Image API
  'PUT /api/v1/image/:id/capture/:partition':{action: 'image/capture'},
  'GET /api/v1/image/:id/deploy/:partition': {action: 'image/deploy'},

  // Role API
  'PUT /api/v1/role/:id/assign':             {action: 'role/assign'},
  'PUT /api/v1/role/:id/unassign':           {action: 'role/unassign'},

  // User API
  'GET /api/v1/user/me':                     {action: 'user/listme'},

  // General API elements.
  'POST /api/v1/:model':                     {action: 'general/create'},
  'DELETE /api/v1/:model/:id?':              {action: 'general/destroy'},
  'GET /api/v1/:model/:id':                  {action: 'general/find'},
  'GET /api/v1/:model':                      {action: 'general/list'},
  'GET /api/v1/:model/search':               {action: 'general/search'},
  'PUT /api/v1/:model/:id':                  {action: 'general/update'},

  // Datatables
  'GET /api/v1/:model/datatable':            {action: 'general/datatable'},
  'POST /api/v1/:model/datatable':           {action: 'general/datatable'},

  // Datatables COlumns
  'GET /api/v1/:model/columns':              {action: 'general/columns'},
  'POST /api/v1/:model/columns':             {action: 'general/columns'},

  // Dashboard View
  'GET /':                                   {action: 'pages/dashboard'},
  'POST /task-history':                      {action: 'task-history'},

  // Group Views
  'GET /groups':                             {action: 'pages/groups'},

  // Host Views
  'GET /hosts':                              {action: 'pages/hosts'},

  // Image Views
  'GET /images':                             {action: 'pages/images'},

  // Role Views
  'GET /roles':                              {action: 'pages/roles'},

  // Task Views
  'GET /tasks':                              {action: 'pages/tasks'},

  // User Views
  'GET /users':                              {action: 'pages/users'},
  'GET /user/me':                            {action: 'user/listme'},

  // Workflow Views
  'GET /workflows':                          {action: 'pages/workflows'},

  // Login View
  'GET /login':                              {action: 'pages/login'},
  'POST /login':                             {action: 'auth/login'},

  // Logout view
  '/logout':                                 {action: 'auth/logout'},

  // System Information
  '/systeminformation':                      {action: 'system/info'},
  '/api/v1/systeminfo':                      {action: 'system/system'},
  '/bandwidth':                              {action: 'system/bandwidth'},
  '/hwinfo':                                 {action: 'pages/hwinfo'}
};
