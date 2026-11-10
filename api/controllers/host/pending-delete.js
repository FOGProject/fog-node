/**
 * DELETE /api/v1/host/pending
 *
 * Delete pending hosts: body {id: [..]}, the shape of the generic delete (the
 * list's "Delete selected" sends it here, views/pages/list.ejs `deleteUrl`).
 * Each listed host that is pending is destroyed, and the plugins remove the
 * rows that link to it, as api/controllers/general/destroy.js does. An
 * approved host is never destroyed here. The enrollment rows bound to a
 * destroyed host get `host: ''`. Needs host.destroy. Answers {count}.
 */
module.exports = {
  friendlyName: 'Delete pending hosts',
  description: 'Destroy the listed pending hosts and unbind their enrollment rows.',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!_.get(req, 'user.permissions.stock.host.destroy')) {
      return res.forbidden();
    }
    const raw = req.allParams().id;
    const ids = (Array.isArray(raw) ? raw : [raw]).filter((id) => typeof id === 'string' && id !== '');
    if (!ids.length) { return res.json({count: 0}); }
    // pending in the criteria: an approved id is skipped, even if it races an approval.
    const destroyed = await sails.models.host.destroy({id: ids, pending: true}).fetch();
    const gone = destroyed.map((host) => host.id);
    if (sails.plugins && sails.plugins.hostDestroy) {
      for (const id of gone) {
        await sails.plugins.hostDestroy(id);
      }
    }
    if (gone.length) {
      await sails.models.agentenrollment.update({host: gone}).set({host: ''});
    }
    return res.json({count: gone.length});
  }
};
