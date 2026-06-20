const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View snapins create',
  description: 'Display "Snapin create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    let data = {
      model: 'snapin',
      header: 'Create New Snapin',
      formItems: {
        name: {
          textarea: false, text: 'Name', type: 'text', id: 'spname', classes: [], placeholder: '7-Zip'
        },
        description: {
          textarea: true, text: 'Description', type: 'text', id: 'spdescription', classes: [], placeholder: 'Some general description'
        },
        file: {
          textarea: false, text: 'File', type: 'text', id: 'spfile', classes: [], placeholder: '7z.exe'
        },
        args: {
          textarea: false, text: 'Arguments', type: 'text', id: 'spargs', classes: [], placeholder: '/S'
        },
        reboot: {
          textarea: false, text: 'Reboot After', type: 'checkbox', id: 'spreboot', classes: [], checked: false
        }
      },
      formButtons: {
        Cancel: { classes: ['btn-warning','float-start'], type: 'submit' },
        Create: { classes: ['btn-success','float-end'], type: 'submit' }
      },
      partialname: false
    };
    data.title = 'Create New Snapin';
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
