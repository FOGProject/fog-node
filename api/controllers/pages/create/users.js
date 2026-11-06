const fs = require('fs-extra');
const path = require('path');
const partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View users create',
  description: 'Display "users create" page.',
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
      model: 'user',
      formItems: {
        displayname: {
          textarea: false,
          text: 'Display Name',
          type: 'text',
          id: 'displayname',
          classes: ['displayname'],
          placeholder: 'Supercool Dude'
        },
        username: {
          textarea: false,
          text: 'Username',
          type: 'text',
          id: 'username',
          classes: ['username'],
          placeholder: 'sdude'
        },
        emailaddress: {
          textarea: false,
          text: 'Email Address',
          type: 'text',
          validations: {
            minLength: 5,
            regex: /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/
          },
          id: 'emailaddress',
          classes: [],
          placeholder: 'some@email.org'
        },
        password: {
          textarea: false,
          text: 'Password',
          type: 'password',
          id: 'password',
          classes: [],
          validations: {
            minLength: 8,
            regex: /(?=.*){8,}/
          },
          placeholder: '********'
        },
        passwordconf: {
          textarea: false,
          text: 'Password (confirm)',
          type: 'password',
          id: 'passwordconf',
          classes: [],
          validations: {
            minLength: 8,
            regex: /(?=.*){8,}/
          },
          placeholder: '********'
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
