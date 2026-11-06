const MacVendor = require('../services/MacVendor');

// Escape a string for HTML text or a double-quoted HTML attribute. Every value
// that reaches the markup goes through it: a record name such as `"><b>` must
// render as text, not as markup.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A FOG setting value is on when it is truthy and not the string "0" or
// "false". FOG stores its settings as strings, so "0" means off there.
function settingOn(value) {
  return !!value && value !== '0' && value !== 'false';
}

const MODES = ['create', 'create-modal', 'edit'];

module.exports = {
  friendlyName: 'Form generator',
  description: 'Generates a create page, create modal or edit page form, with its buttons, as FOG 1.6 lays them out.',
  inputs: {
    model: { type: 'string', required: true },
    formItems: { type: 'json', required: true },
    mode: {
      description: 'create: titled section cards and one Create button. create-modal: the same, wrapped in the ' +
        '[data-fog-create-modal] root, with Cancel and Create. edit: a tabs card with one form and one Update per ' +
        'tab, and Delete in the General tab.',
      type: 'string',
      required: true,
      isIn: MODES
    },
    formType: { type: 'string', defaultsTo: 'form-horizontal' },
    method: { type: 'string', defaultsTo: 'post' },
    action: { type: 'string' },
    id: {
      description: 'Create modes: the id of the outer card; the form gets "<id>-form". Edit mode: the prefix of ' +
        'each tab form id, "<id>-<tab slug>".',
      type: 'string'
    },
    classes: { type: 'json', defaultsTo: [] },
    tabOrder: {
      description: 'Optional ordered list of tab names. The fields are grouped by each item\'s `tab` property ' +
        '(default General): edit mode renders one tab per group, create modes one section card per group.',
      type: 'json',
      defaultsTo: []
    },
    record: {
      description: 'Edit mode: {id, name} of the record, for the Delete button and its confirmation.',
      type: 'json'
    },
    listUrl: {
      description: 'Edit mode: the list page that Delete returns to, for example /hosts.',
      type: 'string'
    },
    panes: {
      description: 'Edit mode: more tabs with no form fields, [{tab, html}]. Each renders one more tab pane, after ' +
        'the General tab, holding its html as given, with no <form> and no footer. The caller escapes every record ' +
        'value in the html.',
      type: 'json',
      defaultsTo: []
    }
  },
  exits: {
    success: { description: 'All done.' }
  },
  fn: async function (inputs) {
    let model = inputs.model;
    let mode = inputs.mode;
    let method = (inputs.method || 'post').toLowerCase() === 'get' ? 'get' : 'post';
    let formItems = inputs.formItems;
    let tabOrder = inputs.tabOrder || [];
    let classes = inputs.classes || [];

    let names = sails.helpers.pageTitle.with({identity: model});
    let singular = names ? names.singular : model.charAt(0).toUpperCase() + model.slice(1);

    // The FOG 1.6 password reveal (index.php:477, fog.common.js:5799) is on
    // only while the FOG_ENABLE_SHOW_PASSWORDS setting is. The setting is read
    // only for a form with a password field, and never created here.
    let showPasswords = false;
    if (Object.keys(formItems).some((k) => formItems[k].type === 'password')) {
      let setting = await sails.models.setting.findOne({name: 'FOG_ENABLE_SHOW_PASSWORDS'});
      showPasswords = !!setting && settingOn(setting.value);
    }

    // One field row on the FOG 1.6 grid (FOGPage.php:5654-5667): the label in
    // col-sm-3, the control in col-sm-9.
    function rowHtml(label, control) {
      return `
            <div class="row mb-3">
              ${label}
              <div class="col-sm-9">${control}
              </div>
            </div>`;
    }

    // Render a single form item to its HTML string.
    function renderField(item, input, obj) {
      // The item's optional `help` text, escaped, under its control, as the
      // maclist hint below. Every row of this item carries it.
      let help = input.help ? `
                <small class="form-text text-muted">${esc(input.help)}</small>` : '';
      let row = (rowLabel, control) => rowHtml(rowLabel, control + help);
      let iId = input.id ? ` id="${esc(input.id)}"` : '';
      let label = `<label class="col-sm-3 col-form-label"${input.id ? ` for="${esc(input.id)}"` : ''}>${esc(input.text)}</label>`;
      // maclist and checktable hold several controls, so no `for`.
      let plainLabel = `<label class="col-sm-3 col-form-label">${esc(input.text)}</label>`;
      let iName = ` name="${esc(item)}"`;
      let iClass = (input.classes && input.classes.length) ? ` ${esc(input.classes.join(' '))}` : '';
      let iValue = input.value ? esc(input.value) : '';
      let iPlaceholder = input.placeholder ? ` placeholder="${esc(input.placeholder)}"` : '';
      let iMaxlength = '';
      let iMinlength = '';
      let iRegex = '';
      let v = input.validations || (obj && obj.validations);
      if (v) {
        if (v.maxLength) { iMaxlength = ` maxlength="${esc(v.maxLength)}"`; }
        if (v.minLength) { iMinlength = ` minlength="${esc(v.minLength)}"`; }
        if (v.regex) { iRegex = ` regex="${esc(v.regex)}"`; }
      }
      if (input.textarea === true) {
        return row(label, `
                <textarea${iId} class="form-control${iClass}"${iPlaceholder}${iName}>${iValue}</textarea>`);
      }
      switch (input.type) {
        case 'checkbox':
          return row(label, `
                <div class="form-check mt-2">
                  <input type="hidden"${iName} value="false"/>
                  <input type="checkbox" class="form-check-input${iClass}"${iId}${iName} value="true"${input.checked ? ' checked' : ''}/>
                </div>`);
        case 'maclist': {
          let macs = Array.isArray(input.value) ? input.value : (input.value ? [input.value] : []);
          if (!macs.length) { macs = ['']; }
          let control = `
                <div data-maclist>`;
          macs.forEach((m, idx) => {
            // Vendor (IEEE OUI) for this already-saved MAC, shown as a hover
            // tooltip. New rows added client-side have no value yet, so they get
            // no addon until the host is saved and the form re-rendered.
            let vendor = MacVendor.lookup(m);
            let vendorAddon = vendor
              ? `
                    <span class="input-group-text" title="${esc(vendor)}" aria-label="Vendor: ${esc(vendor)}"><i class="fa fa-info-circle text-muted"></i></span>`
              : '';
            // `pattern` escapes the hyphen: the browser's regex `v` flag rejects
            // a bare `-` in [:.-]. Same pattern as assets/fog/fog.maclist.js.
            control += `
                  <div class="input-group mb-1 maclist-row">
                    <div class="input-group-text">
                      <input type="radio" name="__primac" title="Primary MAC"${idx === 0 ? ' checked' : ''}/>
                    </div>
                    <input type="text" class="form-control" name="macs[]" value="${esc(m)}" placeholder="aa:bb:cc:dd:ee:ff" pattern="[0-9A-Fa-f]{2}([:.\\-]?[0-9A-Fa-f]{2}){5}" title="A MAC address, e.g. aa:bb:cc:dd:ee:ff"/>${vendorAddon}
                    <button type="button" class="btn btn-outline-danger maclist-remove" tabindex="-1">&times;</button>
                  </div>`;
          });
          control += `
                  <button type="button" class="btn btn-sm btn-secondary maclist-add">+ Add MAC</button>
                </div>
                <small class="form-text text-muted">Select the radio of the primary MAC.</small>`;
          return row(plainLabel, control);
        }
        case 'select': {
          let control = `
                <select class="form-control${iClass}"${iId}${iName}>
                  <option value="">(none)</option>`;
          (input.options || []).forEach((o) => {
            control += `
                  <option value="${esc(o.value)}"${o.selected ? ' selected' : ''}>${esc(o.label)}</option>`;
          });
          control += `
                </select>`;
          return row(label, control);
        }
        case 'taginput': {
          // Chip/token input; fog.taginput.js builds the chips + hidden field
          // from data-tags on load. Value may be an array or a comma string.
          let vals = Array.isArray(input.value)
            ? input.value
            : (input.value ? String(input.value).split(/[\n,]+/) : []);
          let csv = vals.map((t) => String(t).trim()).filter(Boolean).join(',');
          return row(label, `
                <div data-taginput data-name="${esc(item)}" data-tags="${esc(csv)}"></div>
                <small class="form-text text-muted">Type a group name and press Enter or comma.</small>`);
        }
        case 'checktable': {
          // Multi (collection) association picker: a filterable, select-all
          // checkbox table. Behaviour wired by assets/fog/fog.assoc.js; styled
          // by assets/styles/zz-fog-assoc.css.
          let opts = input.options || [];
          let total = opts.length;
          let selected = opts.filter((o) => o.checked).length;
          // A checktable with nothing checked submits nothing, so this empty
          // value makes its tab always send the key. An empty list then means
          // "none selected", and a form without this tab leaves the list alone
          // (general/save and the plugin host-save hooks drop the '').
          let control = `
                <input type="hidden" name="${esc(item)}[]" value=""/>`;
          if (!total) {
            control += `
                <div class="assoc-empty">None available.</div>`;
          } else {
            control += `
                <div class="assoc-picker" data-assoc-picker>
                  <div class="assoc-toolbar">
                    <div class="form-check">
                      <input class="form-check-input" type="checkbox" id="assoc-all-${esc(item)}" data-assoc-all/>
                      <label class="form-check-label" for="assoc-all-${esc(item)}">Select all</label>
                    </div>
                    <span class="assoc-count text-muted" data-assoc-count><strong>${selected}</strong> of ${total} selected</span>
                    <div class="assoc-search">
                      <input type="search" class="form-control form-control-sm" data-assoc-search placeholder="Filter&hellip;" aria-label="Filter ${esc(input.text)}"/>
                    </div>
                  </div>
                  <div class="assoc-scroll">
                    <table class="table table-sm table-striped table-hover align-middle mb-0">
                      <tbody>`;
            opts.forEach((o) => {
              control += `
                        <tr class="assoc-row${o.checked ? ' selected' : ''}">
                          <td class="assoc-check"><input type="checkbox" class="form-check-input" name="${esc(item)}[]" value="${esc(o.value)}"${o.checked ? ' checked' : ''}/></td>
                          <td class="assoc-name">${esc(o.label)}</td>
                        </tr>`;
            });
            control += `
                      </tbody>
                    </table>
                  </div>
                </div>`;
          }
          return row(plainLabel, control);
        }
        default: {
          let control = `
                <input type="${esc(input.type)}"${iId} class="form-control${iClass}"${iName}${iPlaceholder} value="${iValue}"${iMaxlength}${iMinlength}${iRegex}/>`;
          if (input.type === 'password' && showPasswords) {
            // The eye goes before the input, as in 1.6. fog.common.js swaps the
            // input type and the icon on a click.
            control = `
                <div class="input-group">
                  <span class="input-group-text"><i class="far fa-eye-slash fogpasswordeye"></i></span>${control}
                </div>`;
          }
          return row(label, control);
        }
      }
    }

    // Group rendered fields into tab buckets (by each item's `tab`, default General).
    let buckets = {};
    let seen = [];
    for (let item in formItems) {
      let input = formItems[item];
      let obj = sails.models[model].attributes[item];
      let tab = input.tab || 'General';
      if (!buckets[tab]) { buckets[tab] = ''; seen.push(tab); }
      buckets[tab] += renderField(item, input, obj);
    }

    // Decide tab order: requested order first (only tabs that have content),
    // then any remaining tabs in first-seen order.
    let tabs = tabOrder.filter((t) => buckets[t]);
    seen.forEach((t) => { if (tabs.indexOf(t) === -1) { tabs.push(t); } });

    let slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let formTag = (formId) => `<form method="${method}" action="${esc(inputs.action)}"${formId ? ` id="${esc(formId)}"` : ''}` +
      ` class="${esc([inputs.formType].concat(classes).join(' '))}">`;

    // The footer buttons per mode. No Cancel on the create page, as in 1.6
    // (FOGPageRender.php:968-972); the modal has one (FOGPage.php:2008-2018).
    // Cancel and Delete are type="button": neither may submit the form.
    const create = `
          <button type="submit" class="btn btn-primary float-end">Create</button>`;
    const cancel = `
          <button type="button" class="btn btn-outline-secondary float-start" data-bs-dismiss="modal" data-fog-cancel>Cancel</button>`;
    const update = `
          <button type="submit" class="btn btn-primary float-end">Update</button>`;

    if (mode === 'edit') {
      let record = inputs.record || {};
      // Delete sits in the General tab only (ImageManagement.php:826-835).
      // fog.common.js confirms it and sends the list page's DELETE call.
      let del = `
          <button type="button" class="btn btn-danger float-start" data-fog-delete data-model="${esc(model)}"` +
        ` data-id="${esc(record.id)}" data-name="${esc(record.name)}" data-list="${esc(inputs.listUrl)}">Delete</button>`;
      // The panes (`panes` input) go after the General tab, or last when
      // there is none. A pane has its own html in place of a form.
      let panes = inputs.panes || [];
      let at = tabs.indexOf('General') + 1 || tabs.length;
      let entries = tabs.map((t) => ({tab: t}));
      entries.splice(at, 0, ...panes.map((p) => ({tab: p.tab, html: p.html})));
      // The tabs card (FOGPage.php:5748-5845), with one form per tab
      // (FOGPageRender.php:894-942), so each tab saves only its own fields.
      let html = `
    <div class="card card-primary card-outline">
      <div class="card-header p-0 border-bottom-0">
        <ul class="nav nav-tabs" role="tablist">`;
      entries.forEach(({tab: t}, idx) => {
        html += `
          <li class="nav-item"><a class="nav-link${idx === 0 ? ' active' : ''}" data-bs-toggle="tab" href="#tab-${slug(t)}" role="tab" aria-selected="${idx === 0}">${esc(t)}</a></li>`;
      });
      html += `
        </ul>
      </div>
      <div class="card-body">
        <div class="tab-content">`;
      entries.forEach(({tab: t, html: paneHtml}, idx) => {
        let body = paneHtml !== undefined ? paneHtml : `
            ${formTag(inputs.id ? `${inputs.id}-${slug(t)}` : '')}
              <div class="card">
                <div class="card-body">${buckets[t]}
                </div>
                <div class="card-footer clearfix">${update}${t === 'General' ? del : ''}
                </div>
              </div>
            </form>`;
        html += `
          <div class="tab-pane fade${idx === 0 ? ' show active' : ''}" id="tab-${slug(t)}" role="tabpanel">${body}
          </div>`;
      });
      html += `
        </div>
      </div>
    </div>`;
      return html;
    }

    // Create page and create modal: titled section cards in one form
    // (FOGPageRender.php:861-888). The first section is titled
    // "Create New <singular>", each further one by its tab name.
    let html = `
    ${formTag(inputs.id ? `${inputs.id}-form` : '')}
      <div class="card"${inputs.id ? ` id="${esc(inputs.id)}"` : ''}>
        <div class="card-body">`;
    tabs.forEach((t, idx) => {
      html += `
          <div class="card card-primary card-outline">
            <div class="card-header">
              <h4 class="card-title">${esc(idx === 0 ? `Create New ${singular}` : t)}</h4>
            </div>
            <div class="card-body">${buckets[t]}
            </div>
          </div>`;
    });
    html += `
        </div>
        <div class="card-footer clearfix">${mode === 'create-modal' ? cancel : ''}${create}
        </div>
      </div>
    </form>`;
    if (mode === 'create-modal') {
      // The root fogCreateModal reads: the form, and the 1.6 modal title
      // (FOGPage.php:2001-2020).
      html = `
  <div data-fog-create-modal data-title="${esc(`Create New ${singular}`)}">${html}
  </div>`;
    }
    return html;
  }
};
