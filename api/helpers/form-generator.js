module.exports = {
  friendlyName: 'Form generator',
  description: 'Generates form information automatically',
  inputs: {
    model: { type: 'string', required: true },
    formItems: { type: 'json', required: true },
    formButtons: { type: 'json', required: true },
    formType: { type: 'string', defaultsTo: 'form-horizontal' },
    method: { type: 'string', defaultsTo: 'post' },
    action: { type: 'string' },
    id: { type: 'string' },
    classes: { type: 'json', defaultsTo: [] },
    tabOrder: {
      description: 'Optional ordered list of tab names. When set (and >1 tab has items) the fields are grouped into Bootstrap tabs by each item\'s `tab` property.',
      type: 'json',
      defaultsTo: []
    }
  },
  exits: {
    success: { description: 'All done.' }
  },
  fn: async function (inputs) {
    let model = inputs.model,
      formType = inputs.formType,
      method = (inputs.method || 'post').toLowerCase() === 'get' ? 'get' : 'post',
      action = inputs.action,
      id = inputs.id,
      classes = inputs.classes,
      formItems = inputs.formItems,
      formButtons = inputs.formButtons,
      tabOrder = inputs.tabOrder || [];

    // Render a single form item to its HTML string.
    function renderField(item, input, obj) {
      let iChecked = '', iId = '', iFor = '', iClass = '', iValue = '',
        iPlaceholder = '', iMaxlength = '', iMinlength = '', iRegex = '',
        iName = ` name="${item}"`,
        field = '';
      if (input.id) {
        iFor = ` for="${input.id}"`;
        iId = ` id="${input.id}"`;
      }
      if (input.classes && input.classes.length > 0) {
        iClass = ` ${input.classes.join(' ')}`;
      }
      if (input.value) {
        iValue = `${input.value}`;
      }
      if (input.placeholder) {
        iPlaceholder = ` placeholder="${input.placeholder}"`;
      }
      let v = input.validations || (obj && obj.validations);
      if (v) {
        if (v.maxLength) { iMaxlength = ` maxlength="${v.maxLength}"`; }
        if (v.minLength) { iMinlength = ` minlength="${v.minLength}"`; }
        if (v.regex) { iRegex = ` regex="${v.regex}"`; }
      }
      if (input.textarea === true) {
        return `
            <div class="row mb-3">
              <label class="col-sm-2 col-form-label"${iFor}>${input.text}</label>
              <div class="col-sm-10">
                <textarea${iId} class="form-control${iClass}"${iPlaceholder}${iName}>${iValue}</textarea>
              </div>
            </div>`;
      }
      switch (input.type) {
        case 'checkbox':
          if (input.checked) { iChecked = ` checked`; }
          return `
            <div class="row mb-3">
              <label class="col-sm-2 col-form-label"${iFor}>${input.text}</label>
              <div class="col-sm-10">
                <div class="form-check mt-2">
                  <input type="hidden"${iName} value="false"/>
                  <input type="checkbox" class="form-check-input${iClass}"${iId}${iName} value="true"${iChecked}/>
                </div>
              </div>
            </div>`;
        case 'maclist': {
          let macs = Array.isArray(input.value) ? input.value : (input.value ? [input.value] : []);
          if (!macs.length) { macs = ['']; }
          field += `
            <div class="row mb-3">
              <label class="col-sm-2 col-form-label">${input.text}</label>
              <div class="col-sm-10">
                <div data-maclist>`;
          macs.forEach((m, idx) => {
            field += `
                  <div class="input-group mb-1 maclist-row">
                    <div class="input-group-text">
                      <input type="radio" name="__primac" title="Primary MAC"${idx === 0 ? ' checked' : ''}/>
                    </div>
                    <input type="text" class="form-control" name="macs[]" value="${m}" placeholder="aa:bb:cc:dd:ee:ff" pattern="[0-9A-Fa-f]{2}([:.-]?[0-9A-Fa-f]{2}){5}" title="A MAC address, e.g. aa:bb:cc:dd:ee:ff"/>
                    <button type="button" class="btn btn-outline-danger maclist-remove" tabindex="-1">&times;</button>
                  </div>`;
          });
          field += `
                  <button type="button" class="btn btn-sm btn-secondary maclist-add">+ Add MAC</button>
                </div>
                <small class="form-text text-muted">Select the radio of the primary MAC.</small>
              </div>
            </div>`;
          return field;
        }
        case 'select': {
          field += `
            <div class="row mb-3">
              <label class="col-sm-2 col-form-label"${iFor}>${input.text}</label>
              <div class="col-sm-10">
                <select class="form-control${iClass}"${iId} name="${item}">
                  <option value="">(none)</option>`;
          (input.options || []).forEach((o) => {
            field += `
                  <option value="${o.value}"${o.selected ? ' selected' : ''}>${o.label}</option>`;
          });
          field += `
                </select>
              </div>
            </div>`;
          return field;
        }
        case 'taginput': {
          // Chip/token input; fog.taginput.js builds the chips + hidden field
          // from data-tags on load. Value may be an array or a comma string.
          let vals = Array.isArray(input.value)
            ? input.value
            : (input.value ? String(input.value).split(/[\n,]+/) : []);
          let csv = vals.map((t) => String(t).trim()).filter(Boolean).join(',');
          field += `
            <div class="row mb-3">
              <label class="col-sm-2 col-form-label"${iFor}>${input.text}</label>
              <div class="col-sm-10">
                <div data-taginput data-name="${item}" data-tags="${csv.replace(/"/g, '&quot;')}"></div>
                <small class="form-text text-muted">Type a tag and press Enter or comma.</small>
              </div>
            </div>`;
          return field;
        }
        case 'checktable': {
          // Multi (collection) association picker: a filterable, select-all
          // checkbox table. Behaviour wired by assets/fog/fog.assoc.js; styled
          // by assets/styles/zz-fog-assoc.css.
          let opts = input.options || [];
          let total = opts.length;
          let selected = opts.filter((o) => o.checked).length;
          field += `
            <div class="row mb-3">
              <label class="col-sm-2 col-form-label">${input.text}</label>
              <div class="col-sm-10">`;
          if (!total) {
            field += `
                <div class="assoc-empty">None available.</div>`;
          } else {
            field += `
                <div class="assoc-picker" data-assoc-picker>
                  <div class="assoc-toolbar">
                    <div class="form-check">
                      <input class="form-check-input" type="checkbox" id="assoc-all-${item}" data-assoc-all/>
                      <label class="form-check-label" for="assoc-all-${item}">Select all</label>
                    </div>
                    <span class="assoc-count text-muted" data-assoc-count><strong>${selected}</strong> of ${total} selected</span>
                    <div class="assoc-search">
                      <input type="search" class="form-control form-control-sm" data-assoc-search placeholder="Filter&hellip;" aria-label="Filter ${input.text}"/>
                    </div>
                  </div>
                  <div class="assoc-scroll">
                    <table class="table table-sm table-striped table-hover align-middle mb-0">
                      <tbody>`;
            opts.forEach((o) => {
              field += `
                        <tr class="assoc-row${o.checked ? ' selected' : ''}">
                          <td class="assoc-check"><input type="checkbox" class="form-check-input" name="${item}[]" value="${o.value}"${o.checked ? ' checked' : ''}/></td>
                          <td class="assoc-name">${o.label}</td>
                        </tr>`;
            });
            field += `
                      </tbody>
                    </table>
                  </div>
                </div>`;
          }
          field += `
              </div>
            </div>`;
          return field;
        }
        default:
          return `
            <div class="row mb-3">
              <label class="col-sm-2 col-form-label"${iFor}>${input.text}</label>
              <div class="col-sm-10">
                <input type="${input.type}"${iId} class="form-control${iClass}"${iName}${iPlaceholder} value="${iValue}"${iMaxlength}${iMinlength}${iRegex}${iChecked}/>
              </div>
            </div>`;
      }
    }

    // Group rendered fields into tab buckets (by each item's `tab`, default General).
    let buckets = {}, seen = [];
    for (let item in formItems) {
      let input = formItems[item],
        obj = sails.models[model].attributes[item],
        tab = input.tab || 'General';
      if (!buckets[tab]) { buckets[tab] = ''; seen.push(tab); }
      buckets[tab] += renderField(item, input, obj);
    }

    // Decide tab order: requested order first (only tabs that have content),
    // then any remaining tabs in first-seen order.
    let tabs = tabOrder.filter((t) => buckets[t]);
    seen.forEach((t) => { if (tabs.indexOf(t) === -1) { tabs.push(t); } });

    let slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let form = `<form method="${method}" action="${action}"`;
    if (id) { form += ` id="${id}"`; }
    form += ` class="${formType}`;
    if (classes.length) { form += ` ${classes.join(' ')}`; }
    form += `">
      <div class="card-body">`;

    if (tabs.length > 1) {
      form += `
        <ul class="nav nav-tabs" role="tablist">`;
      tabs.forEach((t, idx) => {
        form += `
          <li class="nav-item"><a class="nav-link${idx === 0 ? ' active' : ''}" data-bs-toggle="tab" href="#tab-${slug(t)}" role="tab">${t}</a></li>`;
      });
      form += `
        </ul>
        <div class="tab-content pt-3">`;
      tabs.forEach((t, idx) => {
        form += `
          <div class="tab-pane fade${idx === 0 ? ' show active' : ''}" id="tab-${slug(t)}" role="tabpanel">${buckets[t]}
          </div>`;
      });
      form += `
        </div>`;
    } else {
      form += (tabs.length ? buckets[tabs[0]] : '');
    }

    form += `
      </div>
      <div class="card-footer">`;
    for (let button in formButtons) {
      let btn = formButtons[button];
      form += `
        <button type="${btn.type}" class="btn${btn.classes && btn.classes.length ? ` ${btn.classes.join(' ')}` : ''}"${btn.id ? ` id="${btn.id}"` : ''}>${button}</button>`;
    }
    form += `
      </div>
    </form>
    `;

    return form;
  }
};
