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
      classes = inputs.classes;
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
      <div class="card-body">
      </div>
      <div class="card-footer">
      </div>
    </form>
    `;

    return form;
  }
};
