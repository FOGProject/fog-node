const assert = require('assert');
const supertest = require('supertest');

// The Group record and host membership (issue #169): a host's `groups` names
// its Groups, without case; a new name creates its Group; a rename and a
// delete follow the members; and the 1.6 permission split, where membership
// is a group edit and a new name needs group.create as well.
describe('Group membership::', () => {
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];
  const H1 = 'mocha169-h1';
  const H2 = 'mocha169-h2';
  const G1 = 'mocha169-g1';
  const G2 = 'mocha169-g2';
  const PREFIX = /^mocha169-/i;
  const CREATE_DENIED = 'You do not have permission to create groups.';

  // Signs in as a browser does: a CSRF token for the login form, then the
  // form POST, then a fresh token (the sign-in regenerates the session).
  async function signIn(username, password) {
    const agent = supertest.agent(app());
    let {body} = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set(...HTML)
      .send({username, password, _csrf: body._csrf})
      .expect(302).expect('Location', '/');
    ({body} = await agent.get('/csrfToken').expect(200));
    return {agent, csrf: body._csrf};
  }

  // The native group collection, to count names without case.
  const groupColl = () => sails.getDatastore(sails.models.group.datastore).manager.collection(sails.models.group.tableName);
  const countGroups = (name) => groupColl().countDocuments({name}, {collation: {locale: 'en', strength: 2}});
  const hostGroups = async (name) => (await sails.models.host.findOne({name})).groups;

  // Every mocha169 record: the hosts, the Groups, the limited users and roles.
  async function cleanup() {
    await sails.models.host.destroy({name: {startsWith: 'mocha169-'}});
    await groupColl().deleteMany({name: {$regex: PREFIX}});
    await sails.models.user.destroy({username: {startsWith: 'mocha-169-'}});
    await sails.models.role.destroy({name: {startsWith: 'mocha-169-'}});
  }

  // The limited-role pattern: a non-admin Role with the given stock
  // permissions, a User in it, and a signed-in agent.
  async function limited(name, stock) {
    const role = await sails.models.role.create({name: `mocha-169-${name}`, isAdmin: false, permissions: {stock}}).fetch();
    await sails.models.user.create({
      username: `mocha-169-${name}`,
      password: 'mocha-169-password',
      email: `mocha-169-${name}@example.com`,
      roles: [role.id]
    });
    return signIn(`mocha-169-${name}`, 'mocha-169-password');
  }

  let admin;
  before(async () => {
    await cleanup();
    admin = await signIn('mochatestadmin', 'mochatestadmin');
  });
  after(cleanup);

  describe('the record and its members', () => {
    let h1;
    let h2;
    let g1;

    it('has the unique group name index without case after a lift', async () => {
      const index = (await groupColl().indexes()).find((i) => i.key && i.key.name === 1);
      assert.ok(index, 'no index on group.name');
      assert.strictEqual(index.unique, true);
      assert.deepStrictEqual([index.collation.locale, index.collation.strength], ['en', 2]);
    });

    // The tags code passed an array element "a,b" whole, which would make a
    // Group name with a comma.
    it('normalizes a groups value: splits strings and array elements, drops non-strings and blanks', () => {
      const normalize = sails.models.host.normalizeGroups;
      assert.deepStrictEqual(normalize(['a,b', ' c\r\nd ', 5, null, 'A', '', ' ']), ['a', 'b', 'c', 'd']);
      assert.deepStrictEqual(normalize('x, y\nz,,X'), ['x', 'y', 'z']);
      assert.deepStrictEqual(normalize(undefined), []);
    });

    it('creates the Group, with order 0, for a host create with a new name', async () => {
      const res = await admin.agent.post('/api/v1/host').set(...AJAX)
        .send({name: H1, groups: [G1]}).expect(200);
      h1 = res.body;
      assert.deepStrictEqual(h1.groups, [G1]);
      g1 = await sails.models.group.findOne({name: G1});
      assert.ok(g1, 'no Group was created');
      assert.strictEqual(g1.order, 0);
    });

    it('stores the Group spelling for a name in another case, and creates no Group', async () => {
      const res = await admin.agent.post('/api/v1/host').set(...AJAX)
        .send({name: H2, groups: ['MOCHA169-G1']}).expect(200);
      h2 = res.body;
      assert.deepStrictEqual(h2.groups, [G1]);
      assert.strictEqual(await countGroups(G1), 1);
    });

    it('refuses a Group whose name differs only in case, with 409 and the 1.6 text', async () => {
      const res = await admin.agent.post('/api/v1/group').set(...AJAX).send({name: 'Mocha169-G1'}).expect(409);
      assert.strictEqual(res.body.message, 'A group already exists with this name!');
      assert.strictEqual(await countGroups(G1), 1);
    });

    it('refuses a Group name with a comma, and creates nothing', async () => {
      await admin.agent.post('/api/v1/group').set(...AJAX).send({name: 'mocha169-a,b'}).expect(400);
      assert.strictEqual(await countGroups('mocha169-a,b'), 0);
      assert.strictEqual(await countGroups('mocha169-a'), 0);
    });

    it('refuses a rename to another Group\'s name in any case, with 409 and the 1.6 text', async () => {
      await sails.models.group.create({name: 'mocha169-other'});
      const res = await admin.agent.put(`/api/v1/group/${g1.id}`).set(...AJAX).send({name: 'MOCHA169-OTHER'}).expect(409);
      assert.strictEqual(res.body.message, 'Please use another group name');
      assert.deepStrictEqual(await hostGroups(H1), [G1]);
    });

    // Waterline stores a number as text, so a numeric name would rename the
    // Group and skip group/rename, and the members would keep the old name.
    it('refuses a name that is not text, with 400, and renames nothing', async () => {
      await admin.agent.put(`/api/v1/group/${g1.id}`).set(...AJAX).send({name: 169}).expect(400);
      assert.strictEqual((await sails.models.group.findOne({id: g1.id})).name, G1);
      assert.deepStrictEqual(await hostGroups(H1), [G1]);
    });

    it('renames the value on each member', async () => {
      await admin.agent.put(`/api/v1/group/${g1.id}`).set(...AJAX).send({name: G2}).expect(200);
      assert.deepStrictEqual(await hostGroups(H1), [G2]);
      assert.deepStrictEqual(await hostGroups(H2), [G2]);
    });

    it('lists the members on the group datatable, with empty grants', async () => {
      const res = await admin.agent.post('/api/v1/group/datatable').set('Accept', 'application/json')
        .send({
          draw: 1,
          columns: [
            {data: 'name', searchable: true, orderable: true, search: {value: ''}},
            {data: 'members', searchable: false, orderable: false, search: {value: ''}},
            {data: 'grants', searchable: false, orderable: false, search: {value: ''}}
          ],
          order: [{column: 0, dir: 'asc'}],
          search: {value: 'mocha169-g', regex: false}
        }).expect(200);
      const row = res.body.data.find((g) => g.name === G2);
      assert.ok(row, 'no datatable row for the group');
      assert.strictEqual(row.members, 2);
      assert.deepStrictEqual(row.grants_list, []);
      assert.strictEqual(row.grants, '');
    });

    it('answers every Group name, an empty one included, on /api/v1/host/groups', async () => {
      const res = await admin.agent.get('/api/v1/host/groups').set(...AJAX).expect(200);
      assert.ok(res.body.groups.includes(G2));
      assert.ok(res.body.groups.includes('mocha169-other'), 'the empty Group is missing');
      const sorted = res.body.groups.slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      assert.deepStrictEqual(res.body.groups, sorted);
    });

    it('has no /api/v1/host/tags route', async () => {
      const res = await admin.agent.get('/api/v1/host/tags').set(...AJAX);
      assert.ok(!(res.body && res.body.tags), 'GET /api/v1/host/tags still answers a tag list');
    });

    it('removes the value from one host only, and an unknown name changes nothing', async () => {
      const res = await admin.agent.post('/api/v1/host/bulk').set(...AJAX)
        .send({id: [h1.id], removeGroups: ['MOCHA169-G2']}).expect(200);
      assert.strictEqual(res.body.msg, 'Removed 1 host(s) from 1 group(s).');
      assert.strictEqual(res.body.title, 'Remove Hosts from Groups Success');
      assert.deepStrictEqual(await hostGroups(H1), []);
      assert.deepStrictEqual(await hostGroups(H2), [G2]);
      await admin.agent.post('/api/v1/host/bulk').set(...AJAX)
        .send({id: [h2.id], removeGroups: ['mocha169-nothing']}).expect(200);
      assert.deepStrictEqual(await hostGroups(H2), [G2]);
    });

    it('adds the selected hosts to a Group, with the 1.6 toast text', async () => {
      const res = await admin.agent.post('/api/v1/host/bulk').set(...AJAX)
        .send({id: [h1.id, h2.id], addGroups: [G2]}).expect(200);
      assert.strictEqual(res.body.msg, 'Added 2 host(s) to 1 group(s).');
      assert.strictEqual(res.body.title, 'Add Hosts to Groups Success');
      assert.deepStrictEqual(await hostGroups(H1), [G2]);
    });

    it('removes the value from each member on a delete, and deletes no host', async () => {
      await admin.agent.delete('/api/v1/group').set(...AJAX).send({id: [g1.id]}).expect(200);
      assert.strictEqual(await countGroups(G2), 0);
      assert.deepStrictEqual(await hostGroups(H1), []);
      assert.deepStrictEqual(await hostGroups(H2), []);
    });

    it('creates a Group from the create form with the 1.6 text, and refuses a name in another case', async () => {
      const send = (name) => admin.agent.post('/groups/create').type('form')
        .set('Accept', 'application/json').set(...AJAX)
        .send({_csrf: admin.csrf, name, description: '', order: ''});
      const res = await send('mocha169-form');
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(_.omit(res.body, 'id'), {ok: true, msg: 'Group added!', title: 'Group Create Success'});
      assert.strictEqual((await sails.models.group.findOne({id: res.body.id})).order, 0);
      const dup = await send('MOCHA169-FORM');
      assert.strictEqual(dup.status, 400);
      assert.deepStrictEqual(dup.body, {ok: false, message: 'A group already exists with this name!', title: 'Group Create Fail'});
    });

    it('matches a member value in another case on a rename and on a delete', async () => {
      // Only a raw write can store another spelling: a host save stores the
      // Group's own (group/ensure).
      const group = await sails.models.group.create({name: 'mocha169-case'}).fetch();
      const hostColl = sails.getDatastore(sails.models.host.datastore).manager.collection(sails.models.host.tableName);
      await hostColl.insertOne({name: 'mocha169-raw', groups: ['keep', 'MOCHA169-CASE']});
      await admin.agent.put(`/api/v1/group/${group.id}`).set(...AJAX).send({name: 'mocha169-case2'}).expect(200);
      assert.deepStrictEqual((await hostColl.findOne({name: 'mocha169-raw'})).groups, ['keep', 'mocha169-case2']);
      await hostColl.updateOne({name: 'mocha169-raw'}, {$set: {groups: ['keep', 'MOCHA169-CASE2']}});
      await admin.agent.delete('/api/v1/group').set(...AJAX).send({id: [group.id]}).expect(200);
      assert.deepStrictEqual((await hostColl.findOne({name: 'mocha169-raw'})).groups, ['keep']);
    });

    it('creates one Group for two concurrent ensure calls with the same new name', async () => {
      const [a, b] = await Promise.all([
        sails.helpers.group.ensure.with({names: ['mocha169-race']}),
        sails.helpers.group.ensure.with({names: ['MOCHA169-RACE']})
      ]);
      assert.deepStrictEqual(a, b);
      assert.strictEqual(await countGroups('mocha169-race'), 1);
    });
  });

  describe('permissions', () => {
    let host;
    before(async () => {
      host = await sails.models.host.create({name: 'mocha169-perm', groups: ['mocha169-existing']}).fetch();
    });

    it('needs group.create for a new name: 403, the 1.6 text, and no host change', async () => {
      const user = await limited('nocreate', {host: {update: true}, group: {update: true}});
      const res = await user.agent.post('/api/v1/host/bulk').set(...AJAX)
        .send({id: [host.id], addGroups: ['mocha169-brand-new']}).expect(403);
      assert.strictEqual(res.body.message, CREATE_DENIED);
      assert.strictEqual(res.body.title, 'Add Hosts to Group Fail');
      assert.deepStrictEqual(await hostGroups('mocha169-perm'), ['mocha169-existing']);
      assert.strictEqual(await countGroups('mocha169-brand-new'), 0);
    });

    it('needs no group.create to add hosts to an existing Group', async () => {
      await sails.models.group.create({name: 'mocha169-second'});
      const user = await signIn('mocha-169-nocreate', 'mocha-169-password');
      await user.agent.post('/api/v1/host/bulk').set(...AJAX)
        .send({id: [host.id], addGroups: ['MOCHA169-SECOND']}).expect(200);
      assert.deepStrictEqual(await hostGroups('mocha169-perm'), ['mocha169-existing', 'mocha169-second']);
    });

    it('needs group.update for addGroups and removeGroups', async () => {
      const user = await limited('noupdate', {host: {update: true}, group: {create: true}});
      await user.agent.post('/api/v1/host/bulk').set(...AJAX)
        .send({id: [host.id], addGroups: ['mocha169-existing']}).expect(403);
      await user.agent.post('/api/v1/host/bulk').set(...AJAX)
        .send({id: [host.id], removeGroups: ['mocha169-existing']}).expect(403);
      assert.deepStrictEqual(await hostGroups('mocha169-perm'), ['mocha169-existing', 'mocha169-second']);
    });

    it('treats membership as a group edit: group.update with no host.update can remove and add', async () => {
      const user = await limited('grouponly', {group: {update: true}});
      await user.agent.post('/api/v1/host/bulk').set(...AJAX)
        .send({id: [host.id], removeGroups: ['mocha169-second']}).expect(200);
      assert.deepStrictEqual(await hostGroups('mocha169-perm'), ['mocha169-existing']);
      // addGroups on an existing Group: the case the spec names.
      await user.agent.post('/api/v1/host/bulk').set(...AJAX)
        .send({id: [host.id], addGroups: ['mocha169-second']}).expect(200);
      assert.deepStrictEqual(await hostGroups('mocha169-perm'), ['mocha169-existing', 'mocha169-second']);
      // An image change is a host edit, and still needs host.update.
      await user.agent.post('/api/v1/host/bulk').set(...AJAX)
        .send({id: [host.id], image: ''}).expect(403);
    });

    it('checks a host create: a new name needs group.create, an existing one and none do not', async () => {
      const user = await limited('hostcreate', {host: {create: true}, group: {update: true}});
      const res = await user.agent.post('/api/v1/host').set(...AJAX)
        .send({name: 'mocha169-made', groups: ['mocha169-create-new']}).expect(403);
      assert.strictEqual(res.body.message, CREATE_DENIED);
      assert.strictEqual(await sails.models.host.count({name: 'mocha169-made'}), 0);
      assert.strictEqual(await countGroups('mocha169-create-new'), 0);
      await user.agent.post('/api/v1/host').set(...AJAX)
        .send({name: 'mocha169-made', groups: ['MOCHA169-EXISTING']}).expect(200);
      assert.deepStrictEqual(await hostGroups('mocha169-made'), ['mocha169-existing']);
      // No groups is no membership change: host.create alone is enough.
      const hostCreate = await limited('hostcreateonly', {host: {create: true}});
      await hostCreate.agent.post('/api/v1/host').set(...AJAX)
        .send({name: 'mocha169-made2', groups: []}).expect(200);
    });

    it('checks the host form: a new name needs group.create, the same names need nothing', async () => {
      const user = await signIn('mocha-169-nocreate', 'mocha-169-password');
      const res = await user.agent.put(`/api/v1/host/${host.id}`).set(...AJAX)
        .send({groups: ['mocha169-existing', 'mocha169-form-new']}).expect(403);
      assert.strictEqual(res.body.message, CREATE_DENIED);
      assert.strictEqual(await countGroups('mocha169-form-new'), 0);
      const page = await user.agent.post(`/hosts/edit/${host.id}`).type('form')
        .set('Accept', 'application/json').set(...AJAX)
        .send({_csrf: user.csrf, groups: 'mocha169-existing, mocha169-form-new'});
      assert.strictEqual(page.status, 403);
      assert.strictEqual(page.body.message, CREATE_DENIED);
      // A host.update holder with no group.update may save the host form when
      // its groups do not change, in any order and case. The unchanged
      // groups are not written.
      const hostOnly = await limited('hostonly', {host: {update: true}});
      await hostOnly.agent.put(`/api/v1/host/${host.id}`).set(...AJAX)
        .send({description: 'x', groups: ['MOCHA169-SECOND', 'mocha169-existing']}).expect(200);
      await hostOnly.agent.put(`/api/v1/host/${host.id}`).set(...AJAX)
        .send({groups: []}).expect(403);
      assert.deepStrictEqual(await hostGroups('mocha169-perm'), ['mocha169-existing', 'mocha169-second']);
    });

    // A stored name whose Group is gone (a failed group/remove, or a delete
    // racing a save): re-saving the same names must not re-create the Group
    // for a caller without group.create.
    it('creates no Group when a host is re-saved with the same names', async () => {
      const orphan = await sails.models.host.create({name: 'mocha169-orphan', groups: ['mocha169-gone']}).fetch();
      await groupColl().deleteMany({name: 'mocha169-gone'});
      const hostOnly = await signIn('mocha-169-hostonly', 'mocha-169-password');
      await hostOnly.agent.put(`/api/v1/host/${orphan.id}`).set(...AJAX)
        .send({description: 'y', groups: ['MOCHA169-GONE']}).expect(200);
      await hostOnly.agent.post(`/hosts/edit/${orphan.id}`).type('form')
        .set('Accept', 'application/json').set(...AJAX)
        .send({_csrf: hostOnly.csrf, groups: 'mocha169-gone'}).expect(200);
      assert.strictEqual(await countGroups('mocha169-gone'), 0);
      assert.deepStrictEqual(await hostGroups('mocha169-orphan'), ['mocha169-gone']);
      // A bulk add writes the stored names too, so it needs group.create for
      // the orphan, even though the added name has a Group.
      const groupOnly = await signIn('mocha-169-grouponly', 'mocha-169-password');
      const bulk = await groupOnly.agent.post('/api/v1/host/bulk').set(...AJAX)
        .send({id: [orphan.id], addGroups: ['mocha169-existing']}).expect(403);
      assert.strictEqual(bulk.body.message, CREATE_DENIED);
      assert.strictEqual(await countGroups('mocha169-gone'), 0);
      assert.deepStrictEqual(await hostGroups('mocha169-orphan'), ['mocha169-gone']);
      // A caller who may create Groups gets the spec behavior: the save
      // creates the Group for the name.
      await admin.agent.put(`/api/v1/host/${orphan.id}`).set(...AJAX)
        .send({groups: ['mocha169-gone']}).expect(200);
      assert.strictEqual(await countGroups('mocha169-gone'), 1);
    });
  });
});
