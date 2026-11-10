/**
 * Custom configuration
 * (sails.config.custom)
 *
 * One-off settings specific to your application.
 *
 * For more information on custom configuration, visit:
 * https://sailsjs.com/config/custom
 */

const path = require('path');

module.exports.custom = {

  // Certificate authority files for fog-agent enrollment: root.pem/.key,
  // agent-ca.pem/.key and agent-ca-bundle.pem. tools/setup/pki.js makes them.
  // The CA keys sit here, so the folder must be readable only by the user that
  // runs fog-node. path.join keeps it valid on any OS. config/local.js may
  // override it (the setup tools carry that override forward).
  pkiDir: path.join(__dirname, '..', 'pki'),

  // The HTTPS port of the fog-agent listener (api/hooks/agent-tls). It asks the
  // agent for its client certificate (mTLS) and serves the same routes as the
  // main port. 0 turns the listener off. Agents use https://<host>:<port>.
  agentTlsPort: 8443,

  // Image store: one folder per image -> <imageStorePath>/<image>/<partition>.img.
  // Single source of truth for the deploy streamer, dashboard/hwinfo disk usage,
  // and the image-store scan. Matches FOG's storageLocation (default /images).
  imageStorePath: '/images',

  /***************************************************************************
  *                                                                          *
  * Any other custom config this Sails app should use during development.    *
  *                                                                          *
  ***************************************************************************/
  // mailgunDomain: 'transactional-mail.example.com',
  // mailgunSecret: 'key-testkeyb183848139913858e8abd9a3',
  // stripeSecret: 'sk_test_Zzd814nldl91104qor5911gjald',
  // …

};
