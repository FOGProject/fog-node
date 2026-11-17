const path = require('path');
const partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
// GET /activity: what has been done on the server, in plain words, read only
// (1.6 ActivityManagement, issue #206). The rows come from
// POST /api/v1/activity/datatable. Needs activity.view.
//
// It does not call sails.helpers.listLocals, for the reason that
// pages/list/audit.js gives: the activity feed is a view over the audit trail,
// not a CRUD model. It sets no editBase, so no row links to an edit page.
module.exports = {
  friendlyName: 'Activity',
  description: 'Activity page.',
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
    if (!sails.helpers.audit.can(this.req, 'activity.view')) {
      throw 'forbidden';
    }
    return {
      // The columns of 1.6 ActivityManagement.php:199-204, in order.
      theads: [
        'Who',
        'When',
        'What',
        'From'
      ],
      section: 'Activity',
      page: 'Activity',
      singular: 'entry',
      plural: 'entries',
      model: 'activity',
      // No row selection and no Delete selected, as 1.6 ($selectable = false).
      selectable: false,
      deleteButton: false,
      partialname: path.join(partialPath, 'activity.js'),
      ...await sails.helpers.tableSettings()
    };
  }
};
