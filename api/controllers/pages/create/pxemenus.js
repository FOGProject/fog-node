const fs = require('fs-extra');
const path = require('path');
const partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View iPXE menus create',
  description: 'Display "iPXE Menu create" page.',
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
      model: 'pxemenu',
      formItems: {
        name: {
          textarea: false, text: 'Name', type: 'text', id: 'pxname', classes: [], placeholder: 'fog.local'
        },
        description: {
          textarea: true, text: 'Description', type: 'text', id: 'pxdescription', classes: [], placeholder: 'Boot to FOG'
        },
        params: {
          textarea: true, text: 'Parameters', type: 'text', id: 'pxparams', classes: [], placeholder: 'kernel ...'
        },
        default: {
          textarea: false, text: 'Default Entry', type: 'checkbox', id: 'pxdefault', classes: [], checked: false
        }
      },
      partialname: false
    };
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
      mode: modal ? 'create-modal' : 'create'
    });
    let partial = path.join(partialPath, `${data.model}.js`);
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
