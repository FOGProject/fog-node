/**
 * Schema revision 2: rename host.tags to host.groups, and create a Group for
 * each name (issue #169).
 *
 * The rules are written out here, not required from api/: a revision must do
 * the same thing for as long as it exists, whatever the app code becomes.
 * They are the rules of Host.normalizeGroups and group/ensure-index today.
 *
 * Each step of `up` is safe to run again, so a rerun after a failure part-way
 * finishes the job, and a second run creates no Group and changes no host.
 */
const COLLATION = {locale: 'en', strength: 2};
// Strength 2 compares letters and accents, and ignores case, as COLLATION.
const sameName = new Intl.Collator('en', {sensitivity: 'accent'});

// Host.normalizeGroups: split strings on commas, carriage returns and line
// feeds, drop each element that is not a string, trim, drop blanks.
function names(raw) {
  let parts = [];
  if (typeof raw === 'string') {
    parts = raw.split(/[\r\n,]+/);
  } else if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (typeof entry === 'string') { parts = parts.concat(entry.split(/[\r\n,]+/)); }
    });
  }
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

async function up(db) {
  let groupColl = db.collection('group');
  let hostColl = db.collection('host');

  // The unique name index without case (api/helpers/group/ensure-index.js).
  await groupColl.createIndex({name: 1}, {unique: true, collation: COLLATION});

  let hosts = await hostColl.find({$or: [{tags: {$exists: true}}, {groups: {$exists: true}}]})
    .sort({_id: 1}).toArray();

  // One spelling per name, without case. An existing Group's name wins;
  // otherwise the first spelling met wins.
  let canonical = [];
  let lookup = (name) => canonical.find((c) => sameName.compare(c, name) === 0);
  let existing = await groupColl.find({}, {projection: {name: 1}}).sort({_id: 1}).toArray();
  existing.forEach((g) => {
    if (typeof g.name === 'string' && !lookup(g.name)) { canonical.push(g.name); }
  });
  let haveGroup = canonical.length;
  let plans = hosts.map((h) => {
    let wanted = names(h.groups).concat(names(h.tags));
    wanted.forEach((n) => { if (!lookup(n)) { canonical.push(n); } });
    return {host: h, wanted};
  });

  // First a Group for each name that has none. A duplicate key means the
  // database already holds that name in a spelling this collator did not
  // match: that stored spelling wins.
  let now = Date.now();
  for (let i = haveGroup; i < canonical.length; i++) {
    try {
      await groupColl.insertOne({name: canonical[i], description: '', order: 0, createdAt: now, updatedAt: now});
    } catch (err) {
      if (err.code !== 11000) { throw err; }
      let found = await groupColl.findOne({name: canonical[i]}, {collation: COLLATION});
      if (!found) { throw err; }
      canonical[i] = found.name;
    }
  }

  // Only then the hosts: `groups` holds the canonical names of its groups,
  // then of its tags, de-duped, in order, and `tags` goes. A host that
  // already holds exactly that, with no `tags`, is not written.
  for (let {host, wanted} of plans) {
    let groups = [];
    wanted.forEach((n) => {
      let name = lookup(n);
      if (groups.indexOf(name) === -1) { groups.push(name); }
    });
    let same = Array.isArray(host.groups) && host.groups.length === groups.length &&
      host.groups.every((g, i) => g === groups[i]);
    if (same && !Object.prototype.hasOwnProperty.call(host, 'tags')) { continue; }
    await hostColl.updateOne({_id: host._id}, {$set: {groups}, $unset: {tags: ''}});
  }
}

// Not reachable by an operator: the migrator only moves up to the
// package.json schema. The rollback is the database backup that the migrator
// offers before it runs (docs/install.md "Update fog-node"). This exists so
// test/migrations/2.test.js can prove the round trip.
async function down(db) {
  let hosts = await db.collection('host').find({groups: {$exists: true}}).toArray();
  for (let host of hosts) {
    await db.collection('host').updateOne({_id: host._id}, {$set: {tags: host.groups}, $unset: {groups: ''}});
  }
  // Groups did not exist before revision 2: every Group goes, with its index.
  try {
    await db.collection('group').drop();
  } catch (err) {
    // 26: NamespaceNotFound, no group collection to drop.
    if (err.code !== 26) { throw err; }
  }
}

module.exports = {
  up: (db, logger, next) => {
    up(db).then(() => next(), next);
  },
  down: (db, logger, next) => {
    down(db).then(() => next(), next);
  },
  _meta: {
    description: 'Rename host.tags to host.groups and create a Group for each name'
  }
};
