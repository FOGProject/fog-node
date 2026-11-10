/**
 * POST /api/v1/host/pending/datatable
 *
 * The rows of the Pending Hosts page (GET /hosts/pending): the hosts with
 * `pending: true`, as DataTables server-side rows {id, name, mac, description},
 * sorted by name. Needs host.read.
 *
 * Search: trim and lowercase the text. A row matches when its lowercased name
 * contains the text, or when any entry of its `macs` (stored as 12 bare hex
 * digits) contains the text with `:`, `-`, `.` and spaces removed. So `lab`
 * finds LAB-01, and `00:11` finds 001122334455.
 */
module.exports = {
  friendlyName: 'Pending hosts datatable',
  description: 'The pending hosts, as DataTables server-side rows.',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!sails.helpers.audit.can(req, 'host.read')) {
      return res.forbidden();
    }
    const body = req.body || {};
    const start = Math.max(0, parseInt(body.start, 10) || 0);
    const length = parseInt(body.length, 10);
    const text = String(_.get(body, 'search.value', '')).trim().toLowerCase();
    const macText = text.replace(/[:\-. ]/g, '');

    const pending = await sails.models.host.find({pending: true}).sort('name ASC');
    const matches = (host) => {
      if (text === '') { return true; }
      if (String(host.name).toLowerCase().includes(text)) { return true; }
      return macText !== '' && (Array.isArray(host.macs) ? host.macs : []).some((m) => String(m).toLowerCase().includes(macText));
    };
    const found = pending.filter(matches);
    // length -1 (DataTables "All") and a missing length answer every row.
    const page = length > 0 ? found.slice(start, start + length) : found.slice(start);

    // The first MAC as aa:bb:cc:dd:ee:ff; a stored value that is not 12 hex digits shows as stored.
    const show = (host) => {
      const first = Array.isArray(host.macs) && host.macs.length ? String(host.macs[0]) : '';
      return /^[0-9a-f]{12}$/i.test(first) ? first.toLowerCase().match(/../g).join(':') : first;
    };
    return res.json({
      draw: parseInt(body.draw, 10) || 0,
      recordsTotal: pending.length,
      recordsFiltered: found.length,
      data: page.map((host) => ({id: host.id, name: host.name, mac: show(host), description: host.description || ''}))
    });
  }
};
