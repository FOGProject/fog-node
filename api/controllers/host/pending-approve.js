/**
 * POST /api/v1/host/pending/approve
 *
 * Approve pending hosts: body {ids: [..]}. Each listed host that is pending
 * gets `pending: false`, and nothing else changes; an approved or unknown id
 * is skipped. Needs host.update. Answers {count}, the hosts approved. As in
 * 1.6 (HostManagement.php:405) there is no "approve all".
 */
module.exports = {
  friendlyName: 'Approve pending hosts',
  description: 'Clear the pending flag of the listed pending hosts.',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!_.get(req, 'user.permissions.stock.host.update')) {
      return res.forbidden();
    }
    const raw = _.get(req.body, 'ids');
    const ids = (Array.isArray(raw) ? raw : [raw]).filter((id) => typeof id === 'string' && id !== '');
    if (!ids.length) { return res.json({count: 0}); }
    const approved = await sails.models.host.update({id: ids, pending: true}).set({pending: false}).fetch();
    return res.json({count: approved.length});
  }
};
