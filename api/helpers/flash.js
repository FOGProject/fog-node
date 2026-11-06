/**
 * Queues a server message for the next page, as FOG 1.6 does
 * (management/index.php:660-675). The entry goes onto req.session.fogFlash;
 * views/layouts/layout.ejs shows each entry as a toast (fogToast in
 * assets/fog/fog.common.js) on the next page it renders, and clears the
 * array in the same render, so a reload shows nothing.
 *
 * Only a server redirect after a full-page form POST sets one. A client-side
 * fetch or $.ajax call shows its own toast instead.
 *
 * Usage: sails.helpers.flash.with({req, type: 'success', text: 'Host updated!', title: 'Host Update Success'})
 * No .now(): Sails builds helpers with execStyle 'natural'
 * (node_modules/sails/lib/hooks/helpers/index.js), so .with() on a sync
 * helper runs it at once and returns its value, which has no .now().
 */
module.exports = {
  friendlyName: 'Flash',
  description: 'Queue a toast for the next page this session renders.',
  sync: true,
  inputs: {
    req: {type: 'ref', required: true, description: 'The request whose session holds the message.'},
    type: {type: 'string', required: true, description: 'The toast type: success, error, warning, info or notice.'},
    text: {type: 'string', required: true, description: 'The toast text. It shows as text, never as HTML.'},
    title: {type: 'string', description: 'The toast title. Without one, the toast shows the type word.'}
  },
  // A sync machine must answer through exits.success.
  fn: function ({req, type, text, title}, exits) {
    // No session (a request the session middleware skipped): nothing to keep.
    if (!req.session) { return exits.success(); }
    if (!Array.isArray(req.session.fogFlash)) { req.session.fogFlash = []; }
    req.session.fogFlash.push({type: type, text: text, title: title});
    return exits.success();
  }
};
