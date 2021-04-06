module.exports = {
  friendlyName: 'Form generator',
  description: 'Generates form information automatically',
  inputs: {
    model: {
      friendlyName: 'Model we are building form for',
      description: 'The form model we are building for',
      type: 'string',
      required: true
    },
    formItems: {
      friendlyName: 'Form Items',
      description: 'What form items to display',
      type: 'json',
      required: true
    },
    formButtons: {
      friendlyName: 'Form Buttons',
      description: 'Form button labels',
      type: 'json',
      required: true
    },
    formType: {
      friendlyName: 'Form Type',
      description: 'The form type we will use',
      type: 'string',
      defaultsTo: 'form-horizontal'
    },
    method: {
      friendlyName: 'Form Method',
      description: 'The form method',
      type: 'string',
      defaultsTo: 'post'
    },
    action: {
      friendlyName: "Form Action",
      description: 'The form action',
      type: 'string'
    },
    id: {
      friendlyName: 'DOM id',
      description: 'The form DOM id to use',
      type: 'string'
    },
    classes: {
      friendlyName: 'Additional Classes',
      description: 'The additional classes to use',
      type: 'json',
      defaultsTo: []
    }
  },
  exits: {
    success: {
      description: 'All done.',
    },
  },
  fn: async function (inputs) {
    let model = inputs.model,
      formType = inputs.formType,
      method = inputs.method,
      action = inputs.action,
      id = inputs.id,
      classes = inputs.classes,
      formItems = inputs.formItems,
      formButtons = inputs.formButtons,
      formo = false,
      formi = false,
      form = `<form `;
    switch (method.toLowerCase()) {
      case 'get':
        method = 'get';
        break;
      default:
        method = 'post';
    }
    form += ` method="${method}"`;
    form += ` action="${action}"`;
    if (id) {
      form += ` id="${id}"`;
    }
    form += ` class="${formType}`;
    if (classes.length) {
      form += ` ${classes.join(' ')}`;
    }
    form += `">
      <div class="card-body">`
    for (item in formItems) {
      input = formItems[item];
      obj = sails.models[model].attributes[item];
      form += `
        <div class="row">
          <div class="col-sm-2">
            <label${input.id ? ` for="${input.id}"` : ''}>${input.text}</label>
          </div>
          <div class="col-sm-10">
      `;
      switch (input.textarea) {
        case true:
          form += `
            <textarea${input.id ? ` id="${input.id}"` : ''} class="form-control${input.classes.length ? ` ${input.classes.join(' ')}` : ''}"${input.placeholder ? ` placeholder="${input.placeholder}"` : ''}>${input.value || ''}</textarea>
          `;
          break;
        default:
          if (obj.validations) {
            formo = `
              <input${input.id ? ` id="${input.id}"` : ''} class="form-control${input.classes.length ? ` ${input.classes.join(' ')}` : ''}"${input.placeholder ? ` placeholder="${input.placeholder}"` : ''} type="${input.type}"${input.value ? ` value="${input.value}"` : ''}${obj.validations.maxLength ? ` maxlength="${obj.validations.maxLength}"` : ''}${obj.validations.regex ? ` regex="${obj.validations.regex}"` : ''}${obj.validations.minLength ? ` minlength="${obj.validations.minLength}"` : ''}/>
            `;
          }
          if (input.validations) {
            formi = `
              <input${input.id ? ` id="${input.id}"` : ''} class="form-control${input.classes.length ? ` ${input.classes.join(' ')}` : ''}"${input.placeholder ? ` placeholder="${input.placeholder}"` : ''} type="${input.type}"${input.value ? ` value="${input.value}"` : ''}${input.validations.maxLength ? ` maxlength="${input.validations.maxLength}"` : ''}${input.validations.regex ? ` regex="${input.validations.regex}"` : ''}${input.validations.minLength ? ` minlength="${input.validations.minLength}"` : ''}/>
            `;
          }
          if (formi) {
            form += formi;
          } else if (formo) {
            form += formo;
          } else {
            form += `<input${input.id ? ` id="${input.id}"` : ''} class="form-control${input.classes.length ? ` ${input.classes.join(' ')}` : ''}"${input.placeholder ? ` placeholder="${input.placeholder}"` : ''} type="${input.type}"${input.value ? ` value="${input.value}"` : ''}/>`;
          }
      }
      form += `
          </div>
        </div>
      `;
    }
    form += `
      </div>
      <div class="card-footer">`;
    for (button in formButtons) {
      btn = formButtons[button];
      form +=`
        <button type="${btn.type}" class="btn${btn.classes.length ? ` ${btn.classes.join(' ')}` : ''}"${btn.id ? ` id="${btn.id}"` : ''}>${button}</button>
      `;
    }
    form += `
      </div>
    </form>
    `;

    return form;
  }
};
