const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View iPXE menus create',
  description: 'Display "iPXE Menu create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    let data = {
      model: 'pxemenu',
      header: 'Create New iPXE Menu',
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
      formButtons: {
        Cancel: { classes: ['btn-warning','float-start'], type: 'submit' },
        Create: { classes: ['btn-success','float-end'], type: 'submit' }
      },
      partialname: false
    };
    data.title = 'Create New iPXE Menu';
    data.form = await sails.helpers.formGenerator.with({
      model: data.model,
      method: 'post',
      action: `/${data.model}s/create`,
      id: `${data.model}-create`,
      classes: [`${data.model}-create-form`],
      formItems: data.formItems,
      formButtons: data.formButtons
    });
    let partial = path.join(partialPath, `${data.model}.js`);
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
