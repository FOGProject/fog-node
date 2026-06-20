const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View printers create',
  description: 'Display "Printer create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    let data = {
      model: 'printer',
      header: 'Create New Printer',
      formItems: {
        name: {
          textarea: false, text: 'Name', type: 'text', id: 'prname', classes: [], placeholder: 'FrontDesk'
        },
        description: {
          textarea: true, text: 'Description', type: 'text', id: 'prdescription', classes: [], placeholder: 'Some general description'
        },
        printerModel: {
          textarea: false, text: 'Model', type: 'text', id: 'prmodel', classes: [], placeholder: 'HP LaserJet'
        },
        port: {
          textarea: false, text: 'Port', type: 'text', id: 'prport', classes: [], placeholder: 'LPT1'
        },
        ip: {
          textarea: false, text: 'IP Address', type: 'text', id: 'prip', classes: [], placeholder: '10.0.0.20'
        }
      },
      formButtons: {
        Cancel: { classes: ['btn-warning','float-start'], type: 'submit' },
        Create: { classes: ['btn-success','float-end'], type: 'submit' }
      },
      partialname: false
    };
    data.title = 'Create New Printer';
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
