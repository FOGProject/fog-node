/**
 * Global Variable Configuration
 * (sails.config.globals)
 *
 * Configure which global variables which will be exposed
 * automatically by Sails.
 *
 * For more information on any of these options, check out:
 * https://sailsjs.com/config/globals
 */

module.exports.globals = {

  /****************************************************************************
  *                                                                           *
  * Whether to expose the locally-installed Lodash as a global variable       *
  * (`_`), making  it accessible throughout your app.                         *
  *                                                                           *
  ****************************************************************************/

  _: require('@sailshq/lodash'),

  /****************************************************************************
  *                                                                           *
  * This app was generated without a dependency on the "async" NPM package.   *
  *                                                                           *
  * > Don't worry!  This is totally unrelated to JavaScript's "async/await".  *
  * > Your code can (and probably should) use `await` as much as possible.    *
  *                                                                           *
  ****************************************************************************/

  async: false,

  /****************************************************************************
  *                                                                           *
  * Whether to expose each of your app's models as global variables.          *
  * (See the link at the top of this file for more information.)              *
  *                                                                           *
  ****************************************************************************/

  models: true,

  /****************************************************************************
  *                                                                           *
  * Whether to expose the Sails app instance as a global variable (`sails`),  *
  * making it accessible throughout your app.                                 *
  *                                                                           *
  ****************************************************************************/

  sails: true,

  // The sidebar menu, in the FOG 1.6 order, labels and Font Awesome 7 icons
  // (1.6 FOGPage.php buildMainMenuItems). api/helpers/build-menu.js sorts the
  // core and plugin items by `order`, so a plugin item (Snapins at 50,
  // Printers at 90) lands at its 1.6 slot. A sub-link renders only while a GET
  // route answers it (api/helpers/is-known-get-path.js). The planned pages stay
  // listed here, so each link comes back by itself when its route lands.
  menuItems: [
    {order: 10, text: 'Dashboard', link: '/', icon: 'fas fa-gauge-high'},
    {
      order: 20, text: 'Hosts', link: '/hosts', icon: 'fas fa-desktop',
      subLinks: [
        {link: '/hosts/create', text: 'Create New Host'},
        {link: '/hosts/pending', text: 'Pending Hosts'},
        {link: '/hosts/pendingMacs', text: 'Pending MACs'},
        {link: '/hosts/export', text: 'Export Hosts'},
        {link: '/hosts/import', text: 'Import Hosts'}
      ]
    },
    {
      order: 40, text: 'Images', link: '/images', icon: 'far fa-hard-drive',
      subLinks: [
        {link: '/images/create', text: 'Create New Image'},
        {link: '/images/multicast', text: 'Multicast Image'},
        {link: '/images/export', text: 'Export Images'},
        {link: '/images/import', text: 'Import Images'}
      ]
    },
    {
      order: 70, text: 'Storage Groups', link: '/storagegroups', icon: 'far fa-object-group',
      subLinks: [
        {link: '/storagegroups/create', text: 'Create New Storage Group'},
        {link: '/storagegroups/export', text: 'Export Storage Groups'},
        {link: '/storagegroups/import', text: 'Import Storage Groups'}
      ]
    },
    {
      order: 80, text: 'Storage Nodes', link: '/storagenodes', icon: 'fas fa-server',
      subLinks: [
        {link: '/storagenodes/create', text: 'Create New Storage Node'},
        {link: '/storagenodes/export', text: 'Export Storage Nodes'},
        {link: '/storagenodes/import', text: 'Import Storage Nodes'}
      ]
    },
    {
      order: 110, text: 'Tasks', link: '/tasks', icon: 'fas fa-bars-progress',
      subLinks: [
        {link: '/tasks/active', text: 'Active Tasks'},
        {link: '/tasks/activemc', text: 'Active Multicast Tasks'},
        {link: '/tasks/activesnapin', text: 'Active Snapin Tasks'},
        {link: '/tasks/scheduled', text: 'Scheduled Tasks'}
      ]
    },
    // fog-node only: 1.6 has no Workflows page.
    {
      order: 115, text: 'Workflows', link: '/workflows', icon: 'fas fa-diagram-project',
      subLinks: [
        {link: '/workflows/create', text: 'Create New Workflow'},
        {link: '/workflows/export', text: 'Export Workflows'},
        {link: '/workflows/import', text: 'Import Workflows'}
      ]
    },
    // The 1.6 "User Administration" group label (FOGPage.php _menuGroups).
    {
      order: 120, text: 'User Administration', icon: 'fas fa-shield',
      children: [
        {
          text: 'Users', link: '/users', icon: 'fas fa-users',
          subLinks: [
            {link: '/users/create', text: 'Create New User'},
            {link: '/users/export', text: 'Export Users'},
            {link: '/users/import', text: 'Import Users'}
          ]
        },
        {
          text: 'Roles', link: '/roles', icon: 'fas fa-user-shield',
          subLinks: [
            {link: '/roles/create', text: 'Create New Role'},
            {link: '/roles/export', text: 'Export Roles'},
            {link: '/roles/import', text: 'Import Roles'}
          ]
        }
      ]
    },
    {
      // `plural` names the "List All" sub-link when the label is singular.
      order: 140, text: 'iPXE Menu', plural: 'iPXE Menus', link: '/pxemenus', icon: 'fas fa-list-ol',
      subLinks: [
        {link: '/pxemenus/create', text: 'Create New iPXE Menu'}
      ]
    }
  ],
  authenticationMechanisms: [
    'local'
  ],
  jwtAuthMechanisms: [
    'jwt-cookiecombo'
  ],
};
