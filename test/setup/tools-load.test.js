const assert = require('assert');

// CI never runs the installer, so a dependency that only tools/ uses (chalk,
// inquirer, figlet, clui) can break it with every check green. chalk 6 did:
// it is ESM-only, and require('chalk').cyan was undefined. Load the shared
// installer modules and print a header, on each Node version CI runs.
describe('installer modules', () => {
  it('load and print a header', () => {
    const header = require('../../tools/lib/header');
    require('../../tools/setup/lib/inquire');
    const log = console.log;
    const out = [];
    console.log = (...args) => out.push(args.join(' '));
    try {
      header.print('test');
      header.printSection('test');
    } finally {
      console.log = log;
    }
    assert.strictEqual(out.length, 3);
  });
});
