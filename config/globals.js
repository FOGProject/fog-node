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

  menuItems: [
    {
      text: 'Dashboard',
      plural: false,
      link: '/',
      icon: 'fa-dashboard',
      subLinks: false
    },
    {
      text: 'Host',
      plural: 'Hosts',
      link: '/hosts',
      icon: 'fa-desktop',
      subLinks: [
        {
          link: '/hosts/create',
          text: 'Create New Host'
        },
        {
          link: '/hosts/pending',
          text: 'Pending Hosts'
        },
        {
          link: '/hosts/pendingMacs',
          text: 'Pending MACs'
        },
        {
          link: '/hosts/export',
          text: 'Export Hosts'
        },
        {
          link: '/hosts/import',
          text: 'Import Hosts'
        }
      ]
    },
    {
      text: 'Group',
      plural: 'Groups',
      link: '/groups',
      icon: 'fa-sitemap',
      subLinks: [
        {
          link: '/groups/create',
          text: 'Create New Group'
        },
        {
          link: '/groups/export',
          text: 'Export Groups'
        },
        {
          link: '/groups/import',
          text: 'Import Groups'
        }
      ],
    },
    {
      text: 'Image',
      plural: 'Images',
      link: '/images',
      icon: 'fa-hdd-o',
      subLinks: [
        {
          link: '/images/create',
          text: 'Create New Image'
        },
        {
          link: '/images/multicast',
          text: 'Multicast Image'
        },
        {
          link: '/images/export',
          text: 'Export Images'
        },
        {
          link: '/images/import',
          text: 'Import Images'
        }
      ],
    },
    {
      text: 'Storage Group',
      plural: 'Storage Groups',
      link: '/storagegroups',
      icon: 'fa-object-group',
      subLinks: [
        {
          link: '/storagegroups/create',
          text: 'Create New Storage Group'
        },
        {
          link: '/storagegroups/export',
          text: 'Export Storage Groups'
        },
        {
          link: '/storagegroups/import',
          text: 'Import Storage Groups'
        }
      ],
    },
    {
      text: 'Storage Node',
      plural: 'Storage Nodes',
      link: '/storagenodes',
      icon: 'fa-archive',
      subLinks: [
        {
          link: '/storagenodes/create',
          text: 'Create New Storage Node'
        },
        {
          link: '/storagenodes/export',
          text: 'Export Storage Nodes'
        },
        {
          link: '/storagenodes/import',
          text: 'Import Storage Nodes'
        }
      ],
    },
    {
      text: 'Module',
      plural: 'Modules',
      link: '/modules',
      icon: 'fa-cogs',
      subLinks: [
        {
          link: '/modules/create',
          text: 'Create New Module'
        },
        {
          link: '/modules/export',
          text: 'Export Modules'
        },
        {
          link: '/modules/import',
          text: 'Import Modules'
        }
      ],
    },
    {
      text: 'Task',
      plural: 'Tasks',
      link: '/tasks',
      icon: 'fa-tasks',
      subLinks: [
        {
          link: '/tasks/active',
          text: 'Active Tasks'
        },
        {
          link: '/tasks/activemc',
          text: 'Active Multicast Tasks'
        },
        {
          link: '/tasks/activesnapin',
          text: 'Active Snapin Tasks'
        },
        {
          link: '/tasks/scheduled',
          text: 'Scheduled Tasks'
        }
      ],
    },
    {
      text: 'User',
      plural: 'Users',
      link: '/users',
      icon: 'fa-users',
      subLinks: [
        {
          link: '/users/create',
          text: 'Create New User'
        },
        {
          link: '/users/export',
          text: 'Export Users'
        },
        {
          link: '/users/import',
          text: 'Import Users'
        }
      ],
    },
    {
      text: 'Role',
      plural: 'Roles',
      link: '/roles',
      icon: 'fa-tags',
      subLinks: [
        {
          link: '/roles/create',
          text: 'Create New Role'
        },
        {
          link: '/roles/export',
          text: 'Export Roles'
        },
        {
          link: '/roles/import',
          text: 'Import Roles'
        }
      ],
    },
    {
      text: 'Workflow',
      plural: 'Workflows',
      link: '/workflows',
      icon: 'fa-line-chart',
      subLinks: [
        {
          link: '/workflows/create',
          text: 'Create New Workflow'
        },
        {
          link: '/workflows/export',
          text: 'Export Workflows'
        },
        {
          link: '/workflows/import',
          text: 'Import Workflows'
        }
      ],
    },
    {
      text: 'iPXE Menu',
      plural: 'iPXE Menus',
      link: '/ipxes',
      icon: 'fa-bars',
      subLinks: [
        {
          link: '/ipxes/create',
          text: 'Create New iPXE Menu'
        },
        {
          link: '/ipxes/export',
          text: 'Export iPXE Menus'
        },
        {
          link: '/ipxes/import',
          text: 'Import iPXE Menus'
        }
      ],
    },
  ],
  authenticationMechanisms: [
    'local'
  ],
  jwtAuthMechanisms: [
    'jwt-cookiecombo'
  ],
};
