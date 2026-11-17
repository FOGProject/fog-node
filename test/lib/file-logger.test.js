const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fileLogger = require('../../api/lib/file-logger');

// The file log (api/lib/file-logger.js): the format, the console split, the
// rotation and the unwritable folder. Each test drives create() with its own
// temporary folder.
describe('File logger::', () => {
  const LINE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z (\w+): (.*)$/;
  let dir;
  let out;
  let err;
  let realOut;
  let realErr;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fog-node-filelog-'));
    out = [];
    err = [];
    realOut = process.stdout.write;
    realErr = process.stderr.write;
    process.stdout.write = (chunk) => { out.push(String(chunk)); return true; };
    process.stderr.write = (chunk) => { err.push(String(chunk)); return true; };
  });

  afterEach(() => {
    process.stdout.write = realOut;
    process.stderr.write = realErr;
    fs.rmSync(dir, {recursive: true, force: true});
  });

  const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');

  it('writes the format to the file and to the console', () => {
    const logger = fileLogger.create({fallbackDir: dir, logDir: dir});
    logger.warn('audit: could not read', 'x');
    logger.info('hello %s', 'there');
    logger.error('bad');
    logger.blank();
    const lines = read('fog-node.log').split('\n');
    assert.strictEqual(lines.length, 5);
    assert.strictEqual(lines[0].match(LINE)[1], 'warn');
    assert.ok(lines[0].endsWith('warn: audit: could not read x'));
    assert.ok(lines[1].endsWith('info: hello there'));
    assert.ok(lines[2].endsWith('error: bad'));
    assert.strictEqual(lines[3], '');
    assert.strictEqual(lines[4], '');
    // The console gets the same line. error and warn go to stderr, info to stdout.
    assert.deepStrictEqual(err, [`${lines[0]}\n`, `${lines[2]}\n`]);
    assert.deepStrictEqual(out, [`${lines[1]}\n`, '\n']);
  });

  it('sends crit to stderr and the other levels to stdout', () => {
    const logger = fileLogger.create({fallbackDir: dir, logDir: dir});
    logger.crit('c');
    for (const level of ['log', 'verbose', 'debug', 'silly']) logger[level]('m');
    assert.strictEqual(err.length, 1);
    assert.ok(err[0].includes(' crit: c'));
    assert.strictEqual(out.length, 4);
  });

  it('rotates past maxBytes and keeps five old files', () => {
    const logger = fileLogger.create({fallbackDir: dir, logDir: dir, maxBytes: 200});
    const text = 'x'.repeat(100);
    logger.error(`first ${text}`);
    logger.error(`second ${text}`);
    assert.ok(read('fog-node.log.1').includes('first'));
    assert.ok(read('fog-node.log').includes('second'));
    for (let i = 0; i < 10; i++) logger.error(`more ${i} ${text}`);
    const names = fs.readdirSync(dir).sort();
    assert.deepStrictEqual(names, ['fog-node.log', 'fog-node.log.1', 'fog-node.log.2', 'fog-node.log.3', 'fog-node.log.4', 'fog-node.log.5']);
    assert.ok(!read('fog-node.log.5').includes('first'));
  });

  it('reports a failed rename once, keeps logging, and retries after maxBytes / 10 more bytes', () => {
    // A fog-node.log.4 file that cannot replace a non-empty folder named
    // fog-node.log.5 makes the first rename fail.
    fs.writeFileSync(path.join(dir, 'fog-node.log.4'), 'old');
    fs.mkdirSync(path.join(dir, 'fog-node.log.5'));
    fs.writeFileSync(path.join(dir, 'fog-node.log.5', 'keep'), 'x');
    const logger = fileLogger.create({fallbackDir: dir, logDir: dir, maxBytes: 1000});
    const rotations = () => err.filter((l) => l.includes('cannot be rotated')).length;
    const size = () => fs.statSync(path.join(dir, 'fog-node.log')).size;
    // Short lines (about 45 bytes): fill the file until the write that would
    // pass 1000 bytes tries to rotate.
    for (let i = 0; i < 40 && rotations() === 0; i++) logger.info(`fill ${i}`);
    assert.strictEqual(rotations(), 1);
    const grown = size();
    // Less than maxBytes / 10 (100) more bytes: no new attempt, the file grows.
    logger.info('one');
    assert.strictEqual(rotations(), 1);
    assert.ok(size() > grown);
    // After 100 more bytes it tries again.
    for (let i = 0; i < 4; i++) logger.info(`more ${i}`);
    assert.strictEqual(rotations(), 2);
  });

  it('reports an unwritable folder once and still logs to the console', () => {
    const blocker = path.join(dir, 'a-file');
    fs.writeFileSync(blocker, 'x');
    const logger = fileLogger.create({fallbackDir: dir, logDir: path.join(blocker, 'logs')});
    assert.doesNotThrow(() => {
      logger.warn('one');
      logger.warn('two');
      logger.info('three');
    });
    const notices = err.filter((l) => l.includes('a-file'));
    assert.strictEqual(notices.length, 1);
    assert.strictEqual(err.filter((l) => / warn: /.test(l)).length, 2);
    assert.strictEqual(out.length, 1);
  });

  describe('resolveDir::', () => {
    // The mocha lift sets global.sails: put it back after each test.
    let lifted;
    beforeEach(() => { lifted = global.sails; });
    afterEach(() => { global.sails = lifted; });

    it('uses sails.config.custom.logDir when it is a non-empty string', () => {
      global.sails = {config: {custom: {logDir: '/somewhere'}}};
      assert.strictEqual(fileLogger.resolveDir({fallbackDir: '/fb'}), '/somewhere');
    });

    it('falls back without sails or with an empty value', () => {
      delete global.sails;
      assert.strictEqual(fileLogger.resolveDir({fallbackDir: '/fb'}), '/fb');
      global.sails = {config: {custom: {logDir: ''}}};
      assert.strictEqual(fileLogger.resolveDir({fallbackDir: '/fb'}), '/fb');
    });
  });
});
