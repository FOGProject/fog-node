const path = require('path');
const partialPath = path.join(__dirname,'..','..','..','..','views','pages','partials','list');
// GET /hosts/agentTokens: the fog-agent enrollment tokens (1.6
// HostManagement::agentTokens, HostManagement.php:829). The rows come from
// GET /api/v1/agent/tokens. A token is minted and revoked, not deleted like a
// record, so the built-in "Delete selected" is hidden and the partial adds
// "Create token" and "Revoke selected".
module.exports = {
  friendlyName: 'Agent tokens',
  description: 'Agent enrollment tokens page.',
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
    if (!_.get(this.req, 'user.permissions.stock.host.read')) {
      throw 'forbidden';
    }
    let data = {
      theads: [
        'Name',
        'State',
        'Uses left',
        'Expires',
        'Created by',
        'Created'
      ],
      model: 'host',
      partialname: path.join(partialPath, 'agent-tokens.js')
    };
    Object.assign(data, await sails.helpers.listLocals.with({identity: data.model, base: '/hosts'}));
    // The 1.6 title is not "All <plural>".
    Object.assign(data, {
      page: 'Agent Enrollment Tokens',
      singular: 'token',
      plural: 'tokens',
      deleteButton: false
    });
    delete data.editBase;
    return data;
  }
};
