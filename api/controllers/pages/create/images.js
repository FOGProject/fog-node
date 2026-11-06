const fs = require('fs-extra');
const path = require('path');
const partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View images create',
  description: 'Display "Images create" page.',
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
      model: 'image',
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
      partialname: false
    };
    let partial = path.join(partialPath, `${data.model}.js`);
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
