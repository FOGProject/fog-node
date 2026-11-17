const path = require('path');
const partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
// GET /audit: the audit trail, read only (1.6 AuditManagement, issue #200). The
// rows come from POST /api/v1/audit/datatable. Needs audit.view.
//
// It does not call sails.helpers.listLocals: that helper needs a page-title
// entry, and the audit trail is not a CRUD model. So this action sets the
// locals that views/pages/list.ejs and the content header read. It sets no
// editBase, so no row links to an edit page.
module.exports = {
  friendlyName: 'Audit log',
  description: 'Audit Log page.',
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
    if (!sails.helpers.audit.can(this.req, 'audit.view')) {
      throw 'forbidden';
    }
    return {
      // The columns of 1.6 AuditManagement.php:103-120, in order.
      theads: [
        'When',
        'Who',
        'Action',
        'Permission',
        'Outcome',
        'Subject',
        'From'
      ],
      section: 'Audit Log',
      page: 'Audit Log',
      singular: 'entry',
      plural: 'entries',
      model: 'audit',
      // No row selection and no Delete selected, as 1.6 ($selectable = false).
      selectable: false,
      deleteButton: false,
      partialname: path.join(partialPath, 'audit.js'),
      ...await sails.helpers.tableSettings()
    };
  }
};
