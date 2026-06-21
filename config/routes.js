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

  // Image API
  'PUT /api/v1/image/:id/capture/:partition':{action: 'image/capture'},
  'GET /api/v1/image/:id/deploy/:partition': {action: 'image/deploy'},

  // Role API
  'PUT /api/v1/role/:id/assign':             {action: 'role/assign'},
  'PUT /api/v1/role/:id/unassign':           {action: 'role/unassign'},

  // User API
  'GET /api/v1/user/me':                     {action: 'user/listme'},

  // Host API
  'POST /api/v1/host/bulk':                  {action: 'host/bulk'},

  // Global search (must precede the :model routes).
  'GET /api/v1/search':                      {action: 'search'},

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

  // Search View
  'GET /search':                             {action: 'pages/search'},

  // iPXE boot script (public; hit by PXE-booting machines)
  'GET /boot.ipxe':                          {action: 'boot'},
  'GET /boot':                               {action: 'boot'},

  // Host Views
  'GET /hosts':                              {action: 'pages/list/hosts'},
  'GET /hosts/create':                       {action: 'pages/create/hosts'},
  'POST /hosts/create':                      {action: 'general/save'},

  // Image Views
  'GET /images':                             {action: 'pages/list/images'},
  'GET /images/create':                      {action: 'pages/create/images'},
  'POST /images/create':                     {action: 'general/save'},

  // Storage Group Views
  'GET /storagegroups':                      {action: 'pages/list/storagegroups'},
  'GET /storagegroups/create':               {action: 'pages/create/storagegroups'},
  'POST /storagegroups/create':              {action: 'general/save'},

  // Storage Node Views
  'GET /storagenodes':                       {action: 'pages/list/storagenodes'},
  'GET /storagenodes/create':                {action: 'pages/create/storagenodes'},
  'POST /storagenodes/create':               {action: 'general/save'},

  // Snapin Views

  // Printer Views

  // iPXE Menu Views
  'GET /pxemenus':                           {action: 'pages/list/pxemenus'},
  'GET /pxemenus/create':                    {action: 'pages/create/pxemenus'},
  'POST /pxemenus/create':                   {action: 'general/save'},

  // Edit Views (generic edit page + save)
  'GET /hosts/edit/:id':                      {action: 'pages/edit'},
  'POST /hosts/edit/:id':                     {action: 'general/save'},
  'GET /images/edit/:id':                     {action: 'pages/edit'},
  'POST /images/edit/:id':                    {action: 'general/save'},
  'GET /storagegroups/edit/:id':             {action: 'pages/edit'},
  'POST /storagegroups/edit/:id':            {action: 'general/save'},
  'GET /storagenodes/edit/:id':              {action: 'pages/edit'},
  'POST /storagenodes/edit/:id':             {action: 'general/save'},
  'GET /pxemenus/edit/:id':                   {action: 'pages/edit'},
  'POST /pxemenus/edit/:id':                  {action: 'general/save'},
  'GET /users/edit/:id':                      {action: 'pages/edit'},
  'POST /users/edit/:id':                     {action: 'general/save'},

  // Role Views
  'GET /roles':                              {action: 'pages/list/roles'},

  // Task Views
  'GET /tasks':                              {action: 'pages/list/tasks'},

  // User Views
  'GET /users':                              {action: 'pages/list/users'},
  'GET /users/create':                       {action: 'pages/create/users'},
  'POST /users/create':                      {action: 'general/save'},
  'GET /user/me':                            {action: 'user/listme'},

  // Workflow Views
  'GET /workflows':                          {action: 'pages/list/workflows'},

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
