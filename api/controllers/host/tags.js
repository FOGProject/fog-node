/**
 * host/tags
 *
 * Return the distinct set of tags in use across all hosts, sorted
 * case-insensitively. Feeds the bulk "Manage tags" modal's remove list when the
 * action targets all hosts matching the current search (no explicit selection to
 * union tags from). Mirrors host/bulk's inline permission check -- there is no
 * :model param here for the generic `read` policy to act on.
 */
module.exports = {
  friendlyName: 'List host tags',
  description: 'Distinct tags used across all hosts.',
  fn: async function () {
    let req = this.req,
      res = this.res;

    if (!_.get(req, 'user.permissions.stock.host.read')) {
      return res.forbidden();
    }

    let hosts = await sails.models.host.find().select(['tags']),
      seen = {},
      out = [];
    for (let h of hosts) {
      if (!Array.isArray(h.tags)) { continue; }
      for (let t of h.tags) {
        let tag = String(t).trim();
        if (!tag) { continue; }
        let key = tag.toLowerCase();
        if (!seen[key]) { seen[key] = true; out.push(tag); }
      }
    }
    out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return res.json({ tags: out });
  }
};
