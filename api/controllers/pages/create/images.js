const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View images create',
  description: 'Display "Images create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    let req = this.req,
      res = this.res,
      data = {
        model: 'image',
        header: 'Create New Image',
        formItems: {
          name: {
            textarea: false,
            text: 'Image Name',
            type: 'text',
            id: 'imagename',
            classes: ['imagename'],
            placeholder: 'Golden-Image'
          },
          description: {
            textarea: true,
            text: 'Description',
            type: 'text',
            id: 'imagedescription',
            classes: [],
            placeholder: 'Some general description'
          },
          enabled: {
            textarea: false,
            text: 'Enabled',
            type: 'checkbox',
            id: 'imageenabled',
            classes: [],
            checked: true
          },
          protected: {
            textarea: false,
            text: 'Protected',
            type: 'checkbox',
            id: 'imageprotected',
            classes: [],
            checked: false
          }
        },
        formButtons: {
          Cancel: {
            classes: ['btn-warning','float-left'],
            type: 'submit'
          },
          Create: {
            classes: ['btn-success','float-right'],
            type: 'submit'
          }
        },
        partialname: false
      },
      partial = path.join(partialPath, `${data.model}.js`);
    data.title = `Create New ${data.model.charAt(0).toUpperCase() + data.model.slice(1)}`,
    data.form = await sails.helpers.formGenerator.with({
      model: data.model,
      method: 'post',
      action: `/${data.model}s/create`,
      id: `${data.model}-create`,
      classes: [`${data.model}-create-form`],
      formItems: data.formItems,
      formButtons: data.formButtons
    });
    if (fs.existsSync(partial)) {
      data.partialname = partial;
    }
    return data;
  }
};
