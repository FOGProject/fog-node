const assert = require('assert');
const fs = require('fs');
const path = require('path');

// The mocha lift (test/lifecycle.test.js) points custom.logDir at a temporary
// folder. A sails.log.warn line reaches fog-node.log there. warn, not info:
// the lift runs at debug, and captains-log drops info below that.
describe('Log file in the lift::', () => {
  it('holds a sails.log.warn line in the configured folder', () => {
    const marker = `log-file-lift-${process.pid}-${Date.now()}`;
    sails.log.warn(marker);
    const file = path.join(sails.config.custom.logDir, 'fog-node.log');
    const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.includes(marker));
    assert.ok(line, 'the marker line is in fog-node.log');
    assert.match(line, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z warn: /);
  });
});
