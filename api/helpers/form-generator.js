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
      let iChecked = '',
        iId = '',
        iFor = '',
        iClass = '',
        iValue = '',
        iPlaceholder = '',
        iMaxlength = '',
        iMinlength = '',
        iRegex = '',
        iName = ` name="${item}"`;
      if (input.id) {
        iFor = ` for="${input.id}"`;
        iId = ` id="${input.id}"`;
      }
      if (input.classes.length > 0) {
        iClass = ` ${input.classes.join(' ')}`;
      }
      if (input.value) {
        iValue = `${input.value}`;
      }
      if (input.placeholder) {
        iPlaceholder = ` placeholder="${input.placeholder}"`;
      }
      if (input.validations || (typeof obj !== 'undefined' && obj.validations)) {
        if (input.validations) {
          if (input.validations.maxLength) {
            iMaxlength = ` maxlength="${input.validations.maxLength}"`;
          }
          if (input.validations.minLength) {
            iMinlength = ` minlength="${input.validations.minLength}"`;
          }
          if (input.validations.regex) {
            iRegex = ` regex="${input.validations.regex}"`;
          }
        }
        if (typeof obj !== 'undefined' && obj.validations) {
          if (obj.validations.maxLength) {
            iMaxlength = ` maxlength="${obj.validations.maxLength}"`;
          }
          if (obj.validations.minLength) {
            iMinlength = ` minlength="${obj.validations.minLength}"`;
          }
          if (obj.validations.regex) {
            iRegex = ` regex="${obj.validations.regex}"`;
          }
        }
      }
      switch (input.textarea) {
        case true:
          form += `
            <div class="form-group row">
              <label class="col-sm-2 col-form-label"${iFor}>${input.text}</label>
              <div class="col-sm-10">
                <textarea${iId} class="form-control${iClass}"${iPlaceholder}${iName}>${iValue}</textarea>
              </div>
            </div>
          `;
          break;
        default:
          switch (input.type) {
            case 'checkbox':
              if (input.checked) {
                iChecked = ` checked`;
              }
              form += `
                <div class="form-group row">
                  <label class="col-sm-2 col-form-label"${iFor}>${input.text}</label>
                  <div class="col-sm-10">
                    <div class="icheck-primary d-inline">
                      <input type="checkbox" class="${iClass}"${iId}${iName}${iChecked}/>
                      <label${iFor}></label>
                    </div>
                  </div>
                </div>
              `;
              break;
            case 'radio':
              // To do create loop and make this check an array required element
              if (input.value.toLowerCase() === input.selected.toLowerCase()) {
                iChecked=` selected`;
              }
              form += `
                <div class="form-group row">
                </div>
              `
              break;
            default:
              form += `
                <div class="form-group row">
                  <label class="col-sm-2 col-form-label"${iFor}>${input.text}</label>
                  <div class="col-sm-10">
                    <input type="${input.type}"${iId} class="form-control${iClass}"${iName}${iPlaceholder} value="${iValue}"${iMaxlength}${iMinlength}${iRegex}${iChecked}/>
                  </div>
                </div>
              `;
          }
      }
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
