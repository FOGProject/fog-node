const fs = require('fs-extra'),
  path = require('path'),
  partialPath = path.join(__dirname, '..', '..', '..','views','pages','partials','create');
module.exports = {
  friendlyName: 'View users create',
  description: 'Display "users create" page.',
  exits: {
    success: {
      viewTemplatePath: 'pages/create'
    }
  },
  fn: async function () {
    let req = this.req,
      res = this.res,
      data = {
        model: 'user',
        header: 'Create New User',
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
