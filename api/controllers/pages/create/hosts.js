const fs = require('fs-extra');
const path = require('path');
const partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View hosts create',
  description: 'Display "Hosts create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    // ?modal=1 (fogCreateModal in assets/fog/fog.common.js): the form alone,
    // with no layout. No other signal sets the modal mode.
    let modal = this.req.query.modal === '1';
    let data = {
      model: 'host',
      formItems: {
        name: {
          textarea: false,
          text: 'Host Name',
          type: 'text',
          id: 'hostname',
          classes: ['hostname'],
          placeholder: 'MYHOSTNAME'
        },
        macs: {
          textarea: false,
          text: 'MAC Addresses',
          type: 'maclist',
          id: 'macaddress',
          classes: [],
          value: []
        },
        description: {
          textarea: true,
          text: 'Description',
          type: 'text',
          id: 'hostdescription',
          classes: [],
          placeholder: 'Some general description'
        },
        groups: {
          textarea: false,
          text: 'Groups',
          type: 'taginput',
          id: 'hostgroups',
          classes: [],
          value: []
        }
      },
      partialname: false
    };
    let partial = path.join(partialPath, `${data.model}.js`);
    // Offer the host's associations on the create form too (no current values).
    Object.assign(data.formItems, await sails.helpers.associationFields.with({ model: 'host', record: null }));
    // Plugin-contributed host fields (e.g. the AD plugin's tab).
    if (sails.plugins && sails.plugins.hostForm) {
      Object.assign(data.formItems, await sails.plugins.hostForm(null));
    }
    let tabOrder = await sails.helpers.formTabs.with({ model: data.model, formItems: data.formItems });
    // The FOG 1.6 content header and tab title read the section, then "Create New <singular>".
    let names = sails.helpers.pageTitle.with({identity: data.model});
    data.section = names.section;
    data.page = `Create New ${names.singular}`;
    data.form = await sails.helpers.formGenerator.with({
      model: data.model,
      method: 'post',
      action: `/${data.model}s/create`,
      id: `${data.model}-create`,
      classes: [`${data.model}-create-form`],
      formItems: data.formItems,
      tabOrder,
      mode: modal ? 'create-modal' : 'create'
    });
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    if (modal) {
      data.modal = true;
      data.layout = false;
    }
    return data;
  }
};
