const path = require('path');
const partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
// GET /agent-activity: the fog-agent enrollment events of each host, grouped by
// host, read only (1.6 AgentActivityManagement, issue #207). The rows come from
// POST /api/v1/agent-activity/summary and /host. Needs agentactivity.view.
//
// It does not call sails.helpers.listLocals, for the reason that
// pages/list/audit.js gives: the page is a view over the audit trail, not a
// CRUD model. It sets no editBase, so no row links to an edit page.
module.exports = {
  friendlyName: 'Agent activity',
  description: 'Agent Activity page.',
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
    if (!sails.helpers.audit.can(this.req, 'agentactivity.view')) {
      throw 'forbidden';
    }
    return {
      // The columns of 1.6 AgentActivityManagement.php:132-136, plus Host and
      // Order. Host and Order are hidden (the partial gives them noVis).
      theads: [
        'When',
        'Event',
        'Detail',
        'Outcome',
        'Host',
        'Order'
      ],
      section: 'Agent Activity',
      page: 'Agent Activity',
      singular: 'event',
      plural: 'events',
      model: 'agent-activity',
      // No row selection and no Delete selected, as 1.6 ($selectable = false).
      selectable: false,
      deleteButton: false,
      partialname: path.join(partialPath, 'agent-activity.js'),
      ...await sails.helpers.tableSettings()
    };
  }
};
