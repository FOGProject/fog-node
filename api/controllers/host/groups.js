/**
 * host/groups
 *
 * Return every Group name, sorted without case, an empty Group included.
 * Feeds the options of the host list's "Edit groups" modal (1.6 "Group
 * Membership"). Mirrors host/bulk's inline permission check -- there is no
 * :model param here for the generic `read` policy to act on.
 */
module.exports = {
  friendlyName: 'List host groups',
  description: 'Every Group name, for the host list group membership modal.',
  fn: async function () {
    let req = this.req;
    let res = this.res;

    if (!sails.helpers.audit.can(req, 'host.read')) {
      return res.forbidden();
    }

    let groups = await sails.models.group.find().select(['name']);
    let out = groups.map((g) => g.name);
    out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return res.json({ groups: out });
  }
};
