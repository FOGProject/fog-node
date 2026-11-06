/**
 * The FOG 1.6 edit-page info card (FOGPageRender.php:704-800): a sticky card
 * of facts about the record, above the tabs card. assets/styles/zz-fog-ui.css
 * makes #edit-info-card sticky.
 *
 * The facts are the 1.6 `$this->notes` of each page (src/Pages/*Management.php),
 * with the 1.6 labels. The first label names the entity type. A fact that
 * fog-node has no field for is left out (issue #155 lists them). There is no
 * ID fact: #pageTitle already shows the id.
 *
 * Usage: await sails.helpers.infoCard.with({model: 'host', record})
 *   `record` is the record pages/edit.js loads, with populateAll().
 *   It returns the card HTML. Every value is escaped.
 */

// Stored bare (aabbccddeeff), shown as aa:bb:cc:dd:ee:ff, as the MAC field does.
function formatMac(m) {
  let hex = String(m).replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  return hex.length === 12 ? hex.match(/.{2}/g).join(':') : String(m);
}

// The name of a populated singleton association, or '' when it is unset.
const nameOf = (assoc) => (assoc && typeof assoc === 'object' && assoc.name) || '';

// [label, value] pairs per model identity.
const NOTES = {
  // HostManagement.php:5166-5176. Last Check-In is out (#155).
  host: async (r) => [
    ['Host', r.name],
    ['Primary MAC', Array.isArray(r.macs) && r.macs.length ? formatMac(r.macs[0]) : ''],
    ['Assigned Image', nameOf(r.image)],
    ['Last Deployed', r.deployed]
  ],
  // GroupManagement.php ~1732-1735. The member count is a count query, as
  // for Storage Nodes below.
  group: async (r) => [
    ['Group', r.name],
    ['Members', (await sails.helpers.group.countMembers.with({names: [r.name]}))[0]]
  ],
  // ImageManagement.php:1053-1063. 1.6 reads `deployed` for Last Captured;
  // fog-node has lastCaptureDate, which wins when set. fog-node has no OS or
  // ImageType model, so those two show the numeric id. Primary Storage Group
  // is out (#155).
  image: async (r) => [
    ['Image', r.name],
    ['OS', r.os],
    ['Image Type', r.imageType],
    ['Last Captured', r.lastCaptureDate || r.deployed],
    ['Size on Server', r.srvsize]
  ],
  // StorageGroupManagement.php:818-824. The master comes from the populated
  // storageNodes. The count is a count query on purpose: issue #149 asks for
  // one where a fact is a count, so the number never depends on populate.
  storagegroup: async (r) => {
    let master = (Array.isArray(r.storageNodes) ? r.storageNodes : []).find((n) => n.isMaster);
    return [
      ['Storage Group', r.name],
      ['Master Node', master ? master.name : 'None'],
      ['Storage Nodes', await sails.models.storagenode.count({storagegroup: r.id})]
    ];
  },
  // StorageNodeManagement.php:1319-1327.
  storagenode: async (r) => [
    ['Storage Node', r.name],
    ['Storage Group', nameOf(r.storagegroup)],
    ['Role', r.isMaster ? 'Master' : 'Member'],
    ['Image Path', r.path],
    ['Max Clients', r.maxClients]
  ],
  // UserManagement.php:1566-1571. Signs In With is out (#155).
  user: async (r) => [
    ['User', r.username],
    ['Friendly Name', r.displayName],
    ['API Enabled', r.apiTokenHash ? 'Yes' : 'No']
  ],
  // SnapinManagement.php:1497-1499.
  snapin: async (r) => [
    ['Snapin', r.name],
    ['File', r.file],
    ['Filesize', r.size]
  ]
};

module.exports = {
  friendlyName: 'Info card',
  description: 'Render the FOG 1.6 edit-page info card for a record.',
  inputs: {
    model: {type: 'string', required: true, description: 'The model identity, for example "host".'},
    record: {type: 'ref', required: true, description: 'The record, loaded with populateAll().'}
  },
  exits: {
    success: {outputFriendlyName: 'Card HTML'}
  },
  fn: async function ({model, record}) {
    let notes;
    if (Object.prototype.hasOwnProperty.call(NOTES, model)) {
      notes = await NOTES[model](record);
    } else {
      // Any other model: its singular label with the name.
      let names = sails.helpers.pageTitle.with({identity: model});
      notes = [[names ? names.singular : model.charAt(0).toUpperCase() + model.slice(1), record.name || record.username]];
    }
    let html = `
    <div class="card mb-3" id="edit-info-card">
      <div class="card-body py-2">
        <div class="row row-cols-auto gx-5 gy-2">`;
    notes.forEach(([label, value]) => {
      let text = (value === undefined || value === null) ? '' : String(value);
      // An empty fact stays in the card, as a muted em dash (FOGPageRender.php:746-755).
      html += `
          <div class="col">
            <div class="small text-secondary text-uppercase">${_.escape(label)}</div>
            <div class="fw-semibold">${text === '' ? '<span class="text-muted">&mdash;</span>' : _.escape(text)}</div>
          </div>`;
    });
    html += `
        </div>
      </div>
    </div>`;
    return html;
  }
};
