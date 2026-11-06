const assert = require('assert');

// The permissions/resolve helper (issue #168). Before it, Role.js and User.js
// merged a role into sails.config.permissions. So the first limited role
// replaced the shared defaults for the process. The tests call the helper as
// the models do: .with(), with no .now().
describe('Permissions resolve helper::', () => {
  const resolve = (roles) => sails.helpers.permissions.resolve.with({roles});
  // Every leaf of a tree, as [dotted path, value] pairs.
  const leaves = (node, path = []) => Object.keys(node).reduce((out, key) => (
    node[key] !== null && typeof node[key] === 'object' ?
      out.concat(leaves(node[key], path.concat(key))) :
      out.concat([[path.concat(key).join('.'), node[key]]])
  ), []);

  // The example from the issue: role A holds a key the defaults do not have.
  const A = {isAdmin: false, permissions: {stock: {host: {read: true}, bogus: {x: true}}}};
  const B = {isAdmin: false, permissions: {stock: {image: {read: true}}}};

  let defaults;
  before(() => {
    defaults = _.cloneDeep(sails.config.permissions);
  });
  afterEach(() => {
    assert.deepStrictEqual(sails.config.permissions, defaults, 'the shared defaults changed');
  });

  it('grants the union of two limited roles, every other leaf false, and drops unknown keys', () => {
    const roles = _.cloneDeep([A, B]);
    const result = resolve(roles);

    assert.deepStrictEqual(leaves(result).map(([path]) => path), leaves(defaults).map(([path]) => path));
    assert.deepStrictEqual(leaves(result).filter(([, value]) => value !== false),
      [['stock.host.read', true], ['stock.image.read', true]]);
    assert.strictEqual(result.stock.bogus, undefined);
    assert.deepStrictEqual(roles, [A, B], 'the input changed');
  });

  it('grants every leaf when any role is an admin, whatever the roles store', () => {
    const result = resolve([B, {isAdmin: true, permissions: {}}]);
    assert.deepStrictEqual(leaves(result), leaves(defaults).map(([path]) => [path, true]));
  });

  it('grants a leaf, or admin, only for an explicit true', () => {
    const result = resolve([
      {permissions: {stock: {host: {read: 'true', update: 1, create: {}}, image: true}}},
      {permissions: null},
      {isAdmin: 'true'},
      {isAdmin: 1}
    ]);
    assert.ok(leaves(result).every(([, value]) => value === false));
  });

  it('returns a new tree, so a change to it leaves the defaults alone', () => {
    const result = resolve([]);
    assert.notStrictEqual(result.stock, sails.config.permissions.stock);
    result.stock.host.read = true;
    assert.strictEqual(sails.config.permissions.stock.host.read, false);
  });
});
