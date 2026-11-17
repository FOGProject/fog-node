const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {CHUNK, MAX_READ} = require('../../api/lib/log-viewer');

// The Log Viewer tail helper (api/helpers/log/tail.js), called as the app
// calls it: .with() with no .now(), as a sync helper (see menu.test.js).
describe('Log tail helper::', () => {
  let dir;
  let n = 0;
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fog-node-tail-')); });
  after(() => { fs.rmSync(dir, {recursive: true, force: true}); });

  // Tails `content` (a string or a Buffer), written to a new file.
  const tail = (content, lines) => {
    const file = path.join(dir, `f${n++}.log`);
    fs.writeFileSync(file, content);
    const fd = fs.openSync(file, 'r');
    try {
      return sails.helpers.log.tail.with({fd, size: fs.fstatSync(fd).size, lines});
    } finally {
      fs.closeSync(fd);
    }
  };
  const numbered = (count) => Array.from({length: count}, (_, i) => `L${i + 1}`);

  it('returns the last N lines of a file bigger than one chunk, oldest first', () => {
    const all = numbered(2000);
    const got = tail(all.join('\n') + '\n', 10);
    assert.deepStrictEqual(got.lines, all.slice(-10));
  });

  it('returns the whole file when it holds fewer lines than asked', () => {
    assert.deepStrictEqual(tail('a\nb\nc\n', 10).lines, ['a', 'b', 'c']);
  });

  it('makes no empty last line from a trailing newline', () => {
    assert.deepStrictEqual(tail('a\nb\n', 10).lines, ['a', 'b']);
  });

  it('counts a last line with no newline as a line', () => {
    assert.deepStrictEqual(tail('a\nb\nc', 2).lines, ['b', 'c']);
  });

  it('keeps an empty line in the middle', () => {
    assert.deepStrictEqual(tail('a\n\nb\n', 10).lines, ['a', '', 'b']);
  });

  it('returns no lines for an empty file', () => {
    assert.deepStrictEqual(tail('', 10), {lines: [], bytesRead: 0});
  });

  it('returns a multibyte character whole when it sits across a 4096-byte boundary', () => {
    // The file is "first\n", a long line K with one "é" (2 bytes), then "last\n".
    // The first read chunk starts CHUNK bytes before the end of the file. `after`
    // is the number of bytes of K after the "é": it moves the "é" so that the
    // chunk edge falls before it, between its two bytes, and after it.
    for (const after of [CHUNK - 8, CHUNK - 7, CHUNK - 6, CHUNK - 5, CHUNK - 4]) {
      const long = 'k'.repeat(50) + 'é' + 'm'.repeat(after);
      const got = tail(Buffer.from(`first\n${long}\nlast\n`), 2);
      assert.deepStrictEqual(got.lines, [long, 'last'], `after=${after}`);
      assert.ok(!got.lines.join('').includes('�'), `a replacement character, after=${after}`);
    }
  });

  it('puts the chunk edge between the two bytes of the "é" in at least one case', () => {
    // The guard of the test above: a layout in which the edge is inside "é".
    const hits = [];
    for (const after of [CHUNK - 8, CHUNK - 7, CHUNK - 6, CHUNK - 5, CHUNK - 4]) {
      const content = Buffer.from(`first\n${'k'.repeat(50)}é${'m'.repeat(after)}\nlast\n`);
      const edge = content.length - CHUNK;
      const first = content.indexOf(0xC3);
      if (edge === first + 1) hits.push(after);
    }
    assert.ok(hits.length > 0, 'no layout puts the chunk edge inside the character');
  });

  it('stops on a short read mid-file, and returns only the chunks read in full', () => {
    // 3 chunks of whole lines. The second read (the middle chunk) comes back
    // short, as if the file shrank: the partial chunk is not used, and the
    // first line left is dropped as partial.
    const all = numbered(1200);
    const content = Buffer.from(all.join('\n') + '\n');
    const file = path.join(dir, `f${n++}.log`);
    fs.writeFileSync(file, content);
    const fd = fs.openSync(file, 'r');
    const real = fs.readSync;
    let reads = 0;
    // Read 2 gives 100 bytes, read 3 (the rest of that chunk) gives none.
    fs.readSync = (...args) => {
      reads++;
      if (reads === 2) return real(args[0], args[1], args[2], 100, args[4]);
      return reads === 3 ? 0 : real(...args);
    };
    try {
      // lines 1000 needs far more than 2 chunks, so the short read is reached.
      const got = sails.helpers.log.tail.with({fd, size: content.length, lines: 1000});
      assert.strictEqual(got.bytesRead, CHUNK);
      // Only the last chunk: its first line is dropped, and the rest is whole.
      const tailText = content.subarray(content.length - CHUNK).toString('utf8').split('\n');
      assert.deepStrictEqual(got.lines, tailText.slice(1, -1));
    } finally {
      fs.readSync = real;
      fs.closeSync(fd);
    }
  });

  it('stops at MAX_READ on one 6 MB line with no newline, and returns no lines', () => {
    const got = tail(Buffer.alloc(6 * 1024 * 1024, 0x61), 100);
    assert.strictEqual(got.bytesRead, MAX_READ);
    assert.deepStrictEqual(got.lines, []);
  });

  it('drops the partial first line at MAX_READ and keeps the whole lines after it', () => {
    // 5 MB of "a" then 3 lines: the read ends inside the "a" line.
    const content = Buffer.concat([Buffer.alloc(5 * 1024 * 1024, 0x61), Buffer.from('\nx\ny\nz\n')]);
    const got = tail(content, 100);
    assert.strictEqual(got.bytesRead, MAX_READ);
    assert.deepStrictEqual(got.lines, ['x', 'y', 'z']);
  });
});
