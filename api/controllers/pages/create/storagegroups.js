const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View storage groups create',
  description: 'Display "Storage Group create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    let data = {
      model: 'storagegroup',
      header: 'Create New Storage Group',
      formItems: {
        name: {
          textarea: false,
          text: 'Name',
          type: 'text',
          id: 'sgname',
          classes: [],
          placeholder: 'Default'
        },
        description: {
          textarea: true,
          text: 'Description',
          type: 'text',
          id: 'sgdescription',
          classes: [],
          placeholder: 'Some general description'
        }
      },
      formButtons: {
        Cancel: {
          classes: ['btn-warning','float-start'],
          type: 'submit'
        },
        Create: {
          classes: ['btn-success','float-end'],
          type: 'submit'
        }
      },
      partialname: false
    };
    data.title = 'Create New Storage Group';
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
