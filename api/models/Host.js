/**
 * Host.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
const MAC_HEX = /^[0-9a-fA-F]{12}$/;
const MacVendor = require('../services/MacVendor');

// Normalise + validate the `macs` json array: accept any common separator style
// (colon/hyphen/dot) or bare 12 hex, store the canonical upper-case colon form,
// drop blanks/dupes, and reject anything that isn't a MAC address.
function normalizeMacs(values, proceed) {
  if (!Object.prototype.hasOwnProperty.call(values, 'macs')) {
    return proceed();
  }
  let raw = values.macs;
  if (typeof raw === 'string') {
    raw = raw.split(/[\s,]+/);
  }
  if (!Array.isArray(raw)) {
    raw = (raw === null || typeof raw === 'undefined') ? [] : [raw];
  }
  let out = [];
  for (let entry of raw) {
    if (entry === null || typeof entry === 'undefined') {
      continue;
    }
    let hex = String(entry).replace(/[\s.:-]/g, '');
    if (hex === '') {
      continue;
    }
    if (!MAC_HEX.test(hex)) {
      return proceed(new Error(`Invalid MAC address: ${entry}`));
    }
    // Stored canonical form: bare lower-case hex, no separators (e.g.
    // "aabbccddeeff"). Displayed as aa:bb:cc:dd:ee:ff at the view layer.
    let mac = hex.toLowerCase();
    if (out.indexOf(mac) === -1) {
      out.push(mac);
    }
  }
  values.macs = out;
  return proceed();
}

// The group names in a `groups` value: split a string on commas, carriage
// returns and line feeds; split each string element of an array the same way,
// and drop each element that is not a string; trim; drop blanks; de-dupe
// without case, keeping the first spelling. An element "a,b" gives "a" and
// "b", so no name ever holds a comma. Exposed as Host.normalizeGroups for the
// group permission check (api/helpers/group/authorize.js) and host/bulk.
function normalizeGroups(raw) {
  let parts = [];
  if (typeof raw === 'string') {
    parts = raw.split(/[\r\n,]+/);
  } else if (Array.isArray(raw)) {
    for (let entry of raw) {
      if (typeof entry === 'string') { parts = parts.concat(entry.split(/[\r\n,]+/)); }
    }
  }
  let out = [];
  let seen = {};
  for (let part of parts) {
    let name = part.trim();
    if (name === '') { continue; }
    let key = name.toLowerCase();
    if (!seen[key]) { seen[key] = true; out.push(name); }
  }
  return out;
}

// Store the `groups` value as Group names: normalize it, then replace each
// name with its Group's stored spelling, creating the Group when none exists
// (api/helpers/group/ensure.js).
async function applyGroups(values) {
  if (!Object.prototype.hasOwnProperty.call(values, 'groups')) {
    return;
  }
  values.groups = await sails.helpers.group.ensure.with({names: normalizeGroups(values.groups)});
}

// The MACs first: a host save that fails on a bad MAC creates no Group.
function beforeSave(values, proceed) {
  normalizeIdentity(values);
  return normalizeMacs(values, (err) => {
    if (err) { return proceed(err); }
    applyGroups(values).then(() => proceed(), proceed);
  });
}

// Canonicalise the fingerprint fields so identity matching is stable: trim, and
// lower-case the guid/serial/asset (SMBIOS values vary in case across firmware).
function normalizeIdentity(values) {
  ['guid', 'serial', 'asset'].forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(values, k) && typeof values[k] === 'string') {
      values[k] = values[k].trim().toLowerCase();
    }
  });
}

module.exports = {
  attributes: {
    name: {
      type: 'string',
      required: true,
      maxLength: 63,
      regex: /^[a-z\d]([a-z\d\-]{0,61}[a-z\d])?(\.[a-z\d]([a-z\d\-]{0,61}[a-z\d])?)*$/i,
      unique: true
    },
    description: {
      type: 'string'
    },
    // NOTE: not `unique` and not `isUUID`. A unique index on an optional field
    // makes every host created without a guid collide (empty/null guids are
    // "equal"), which 409s the 2nd host; and isUUID rejects the empty string on
    // edit. The hardware guid is set/validated at registration time instead.
    guid: {
      type: 'string'
    },
    macs: {
      type: 'json'
    },
    // The host's group membership: the names of its Groups (api/models/Group.js),
    // as a de-duped string array, the FOG 1.6 groups (issue #169; ui16-11c
    // records the decision as an ADR). Schema revision 2 (migrations/2.js)
    // renamed it from `tags`.
    groups: {
      type: 'json'
    },
    // --- Hardware fingerprint (issue #198): a host is identified by the scored
    //     makeup of the physical machine, not by MAC alone. iPXE exposes these
    //     SMBIOS values natively. `guid` is the SMBIOS product UUID. ---
    serial: {
      type: 'string'
    },
    asset: {
      type: 'string'
    },
    // --- FOG 1.x `hosts` scalar fields (friendly names; snake_case
    //     security fields normalised to camelCase) ---
    ip: {
      type: 'string'
    },
    building: {
      type: 'number',
      isInteger: true,
      defaultsTo: 0
    },
    deployed: {
      type: 'string'
    },
    createdBy: {
      type: 'string'
    },
    // Active Directory domain-join fields moved OUT to the `ad` plugin
    // (plugins/ad) -- it owns its own collection + contributes the AD tab via
    // the host:form/host:save/host:destroy hooks. See docs/adr/0001.
    productKey: {
      type: 'string'
    },
    kernelArgs: {
      type: 'string'
    },
    kernel: {
      type: 'string'
    },
    kernelDevice: {
      type: 'string'
    },
    init: {
      type: 'string'
    },
    pending: {
      type: 'boolean',
      defaultsTo: false
    },
    pubKey: {
      type: 'string'
    },
    secToken: {
      type: 'string'
    },
    secTime: {
      type: 'string'
    },
    pingstatus: {
      type: 'string'
    },
    biosexit: {
      type: 'string'
    },
    efiexit: {
      type: 'string'
    },
    enforce: {
      type: 'boolean',
      defaultsTo: false
    },
    token: {
      type: 'string'
    },
    tokenlock: {
      type: 'boolean',
      defaultsTo: false
    },
    image: {
      model: 'image'
    },
    workflows: {
      collection: 'workflow',
      via: 'host'
    }
  },
  // Attach a `macVendors` array (vendor name per MAC, index-aligned with
  // `macs`, '' when unknown) to every serialized host so the view layer can
  // label each MAC with its IEEE OUI vendor without a round trip. Additive:
  // all existing fields are preserved.
  customToJSON: function() {
    let obj = Object.assign({}, this);
    obj.macVendors = MacVendor.lookupAll(Array.isArray(this.macs) ? this.macs : []);
    return obj;
  },
  beforeCreate: beforeSave,
  beforeUpdate: beforeSave,
  // A custom model method (sails.models.host.normalizeGroups).
  normalizeGroups
};
