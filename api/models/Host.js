/**
 * Host.js
 *
 * @description :: A model definition represents a database table/collection.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
const MAC_HEX = /^[0-9a-fA-F]{12}$/;

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
    useAD: {
      type: 'boolean',
      defaultsTo: false
    },
    ADDomain: {
      type: 'string'
    },
    ADOU: {
      type: 'string'
    },
    ADUser: {
      type: 'string'
    },
    ADPass: {
      type: 'string'
    },
    ADPassLegacy: {
      type: 'string'
    },
    productKey: {
      type: 'string'
    },
    printerLevel: {
      type: 'number',
      isInteger: true,
      defaultsTo: 0
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
    groups: {
      collection: 'group',
      via: 'hosts'
    },
    workflows: {
      collection: 'workflow',
      via: 'host'
    },
    snapins: {
      collection: 'snapin',
      via: 'hosts',
      dominant: true
    },
    printers: {
      collection: 'printer',
      via: 'hosts',
      dominant: true
    },
    defaultPrinter: {
      model: 'printer'
    }
  },
  beforeCreate: function(values, proceed) {
    return normalizeMacs(values, proceed);
  },
  beforeUpdate: function(values, proceed) {
    return normalizeMacs(values, proceed);
  }
};
