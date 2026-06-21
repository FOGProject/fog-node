/**
 * ad plugin
 *
 * Host Active Directory domain-join (a POST-DEPLOY concern handled by FOS/
 * fog-client) -- the reference example of a plugin that extends a core entity
 * WITHOUT touching the core model. It owns its own mongo collection
 * (`plugin_ad`, keyed by host id) and contributes an "Active Directory" tab to
 * the host form via the host:form / host:save / host:destroy hooks.
 *
 * (Distinct from fog-plugin-activedirectory, which is admin login auth.)
 */
const COLLECTION = 'plugin_ad';

function coll() {
  return sails.getDatastore(sails.models.host.datastore).manager.collection(COLLECTION);
}

function toBool(v) {
  if (Array.isArray(v)) { v = v[v.length - 1]; } // hidden+checkbox pair
  return v === true || v === 'true' || v === 'on' || v === '1';
}

const AD = 'Active Directory';

module.exports = {
  name: 'ad',
  extends: {
    host: {
      // Build the "Active Directory" tab, populated from this plugin's record.
      form: async function (record) {
        let doc = (record && record.id) ? await coll().findOne({ host: String(record.id) }) : null;
        doc = doc || {};
        return {
          'ad[useAD]': { text: 'Join Domain', type: 'checkbox', classes: [], textarea: false, tab: AD, checked: !!doc.useAD },
          'ad[ADDomain]': { text: 'Domain', type: 'text', classes: [], textarea: false, tab: AD, value: doc.ADDomain || '' },
          'ad[ADOU]': { text: 'Organizational Unit', type: 'text', classes: [], textarea: false, tab: AD, value: doc.ADOU || '' },
          'ad[ADUser]': { text: 'Domain User', type: 'text', classes: [], textarea: false, tab: AD, value: doc.ADUser || '' },
          'ad[ADPass]': { text: 'Domain Password', type: 'password', classes: [], textarea: false, tab: AD, value: doc.ADPass || '' },
          'ad[ADPassLegacy]': { text: 'Legacy Password', type: 'text', classes: [], textarea: false, tab: AD, value: doc.ADPassLegacy || '' }
        };
      },

      // Persist this plugin's slice (params.ad) into its own collection.
      save: async function (hostId, params) {
        if (!params || !params.ad) { return; }
        let ad = params.ad;
        await coll().updateOne(
          { host: String(hostId) },
          {
            $set: {
              host: String(hostId),
              useAD: toBool(ad.useAD),
              ADDomain: ad.ADDomain || '',
              ADOU: ad.ADOU || '',
              ADUser: ad.ADUser || '',
              ADPass: ad.ADPass || '',
              ADPassLegacy: ad.ADPassLegacy || '',
              updatedAt: Date.now()
            }
          },
          { upsert: true }
        );
      },

      // Cascade cleanup when the host is deleted.
      destroy: async function (hostId) {
        await coll().deleteOne({ host: String(hostId) });
      }
    }
  }
};
