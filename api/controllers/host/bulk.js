/**
 * host/bulk
 *
 * Apply tag/image changes to many hosts at once -- the "push config to a set of
 * hosts" half of what 1.x groups did, driven by host-list selection instead of a
 * group entity (see docs/adr/0001). Accepts { id:[...], addTags, removeTags,
 * image } where `image` is an image name or id ('' clears it).
 */
module.exports = {
  friendlyName: 'Bulk host update',
  description: 'Apply tag/image changes to many selected hosts.',
  fn: async function () {
    let req = this.req,
      res = this.res,
      p = req.allParams(),
      perms = req.user && req.user.permissions && req.user.permissions.stock && req.user.permissions.stock.host;

    if (!perms || !perms.update) { return res.forbidden(); }

    let ids = Array.isArray(p.id) ? p.id : (p.id ? [p.id] : []);
    if (!ids.length) { return res.badRequest({ error: 'No hosts selected.' }); }

    let toArr = (v) => (Array.isArray(v) ? v : (v ? [v] : [])).map((x) => String(x).trim()).filter(Boolean),
      addTags = toArr(p.addTags),
      removeTags = toArr(p.removeTags).map((t) => t.toLowerCase());

    // Resolve a requested image by name or id; '' (or null) clears it.
    let imageSet; // undefined => leave image alone
    if (Object.prototype.hasOwnProperty.call(p, 'image')) {
      if (p.image === '' || p.image === null) {
        imageSet = null;
      } else {
        let img = await sails.models.image.findOne({ name: p.image });
        if (!img) { try { img = await sails.models.image.findOne({ id: p.image }); } catch (unused) { /* not an id */ } }
        if (!img) { return res.badRequest({ error: `Image not found: ${p.image}` }); }
        imageSet = img.id;
      }
    }

    let hosts = await sails.models.host.find({ id: ids }),
      updated = 0;
    for (let h of hosts) {
      let set = {};
      if (addTags.length || removeTags.length) {
        let tags = Array.isArray(h.tags) ? h.tags.slice() : [];
        tags = tags.filter((t) => removeTags.indexOf(String(t).toLowerCase()) === -1);
        for (let t of addTags) {
          if (!tags.some((x) => String(x).toLowerCase() === t.toLowerCase())) { tags.push(t); }
        }
        set.tags = tags;
      }
      if (imageSet !== undefined) { set.image = imageSet; }
      if (Object.keys(set).length) {
        await sails.models.host.updateOne({ id: h.id }).set(set);
        updated++;
      }
    }
    return res.json({ updated });
  }
};
