const path = require('path');
const partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
// GET /hosts/pending: the hosts that wait for an admin to approve them (1.6
// HostManagement::pending, HostManagement.php:270). The rows come from
// POST /api/v1/host/pending/datatable. "Delete selected" goes to
// DELETE /api/v1/host/pending, so an approved host is never deleted here.
module.exports = {
  friendlyName: 'Pending hosts',
  description: 'Pending hosts page.',
  inputs: {
  },
  exits: {
    error: {
      responseType: 'serverError'
    },
    forbidden: {
      responseType: 'forbidden'
    },
    success: {
      viewTemplatePath: 'pages/list',
      description: 'Successful'
    }
  },
  fn: async function () {
    if (!sails.helpers.audit.can(this.req, 'host.read')) {
      throw 'forbidden';
    }
    let data = {
      theads: [
        'Host',
        'Primary MAC',
        'Description'
      ],
      model: 'host',
      partialname: path.join(partialPath, 'pending-hosts.js'),
      deleteUrl: '/api/v1/host/pending'
    };
    // The nouns, the table settings and the edit link base
    // (api/helpers/list-locals.js), then the 1.6 title of this page.
    Object.assign(data, await sails.helpers.listLocals.with({identity: data.model, base: '/hosts'}));
    data.page = 'All Pending Hosts';
    return data;
  }
};
