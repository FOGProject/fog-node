const path = require('path');
const partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
// GET /hosts/pendingAgents: the fog-agent enrollments that wait for an admin
// (1.6 HostManagement::pendingAgents, HostManagement.php:650). The rows come
// from GET /api/v1/agent/enrollments. An enrollment is approved or denied,
// never deleted, so the page has no "Delete selected" button.
module.exports = {
  friendlyName: 'Pending agents',
  description: 'Pending agents page.',
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
        'Reason',
        'Platform',
        'Agent',
        'From',
        'Identity',
        'Requested'
      ],
      model: 'host',
      partialname: path.join(partialPath, 'pending-agents.js')
    };
    Object.assign(data, await sails.helpers.listLocals.with({identity: data.model, base: '/hosts'}));
    // A row is an enrollment, not a host: its own nouns, no edit link base
    // for the first column (the partial links to the host itself), no delete.
    Object.assign(data, {
      page: 'All Pending Agents',
      singular: 'agent',
      plural: 'agents',
      deleteButton: false
    });
    delete data.editBase;
    return data;
  }
};
