const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const escrow = require('../../api/lib/agent-ca-escrow');
const support = require('../support/pki');

// The agent CA backup format (api/lib/agent-ca-escrow.js). Seal and open use a
// small scrypt N for speed; one test checks the default.
describe('Agent CA escrow::', function () {
  this.timeout(120000);

  const FAST = {N: 1024, r: 8, p: 1};
  const PASS = 'throwaway test passphrase one';
  const NAMES = {rootKey: 'root.key', rootCert: 'root.pem', agentCaKey: 'agent-ca.key', agentCaCert: 'agent-ca.pem'};
  let dir;
  let record;

  before(async () => {
    dir = await support.fixture();
    record = await escrow.seal(dir, PASS, FAST);
  });

  const pems = (from) => Object.fromEntries(Object.entries(NAMES).map(([k, name]) => [k, fs.readFileSync(path.join(from, name), 'utf8')]));
  // The base64 text with its first decoded byte changed.
  const flip = (b64) => {
    const bytes = Buffer.from(b64, 'base64');
    bytes[0] ^= 0x01;
    return bytes.toString('base64');
  };
  // A fingerprint with its first hex digit changed.
  const other = (fp) => (fp[0] === '0' ? '1' : '0') + fp.slice(1);
  const changed = (patch) => Object.assign({}, record, patch);
  const withKdf = (patch) => changed({kdf: Object.assign({}, record.kdf, patch)});

  describe('seal and open::', () => {
    it('round-trips the four PEMs of the fixture', async () => {
      assert.deepStrictEqual(await escrow.open(record, PASS), pems(dir));
    });

    it('writes the record attributes, with no PEM text in clear', () => {
      assert.strictEqual(record.version, 1);
      assert.strictEqual(record.rootFingerprint, support.rootOf(dir));
      assert.strictEqual(record.kdf.name, 'scrypt');
      assert.strictEqual(Buffer.from(record.kdf.salt, 'base64').length, 16);
      assert.strictEqual(Buffer.from(record.iv, 'base64').length, 12);
      assert.strictEqual(Buffer.from(record.tag, 'base64').length, 16);
      assert.ok(!JSON.stringify(record).includes('BEGIN'));
    });

    it('makes a new salt and iv on each seal', async () => {
      const again = await escrow.seal(dir, PASS, FAST);
      assert.notStrictEqual(again.kdf.salt, record.kdf.salt);
      assert.notStrictEqual(again.iv, record.iv);
    });

    it('defaults to N 131072, and a seal with no kdf argument writes it', async () => {
      assert.strictEqual(escrow.KDF_DEFAULTS.N, 131072);
      const sealed = await escrow.seal(dir, PASS);
      assert.deepStrictEqual([sealed.kdf.N, sealed.kdf.r, sealed.kdf.p], [131072, 8, 1]);
      assert.deepStrictEqual(await escrow.open(sealed, PASS), pems(dir));
    });

    it('opens with the same passphrase in another spacing', async () => {
      assert.deepStrictEqual(await escrow.open(record, `  ${PASS.split(' ').join('  \t')} `), pems(dir));
    });

    it('refuses a wrong passphrase with E_ESCROW_PASSPHRASE', async () => {
      await assert.rejects(() => escrow.open(record, 'not the right passphrase at all'),
        {code: 'E_ESCROW_PASSPHRASE', message: 'The passphrase does not open the agent CA backup.'});
    });

    for (const [label, patch] of [
      ['ciphertext', () => changed({ciphertext: flip(record.ciphertext)})],
      ['tag', () => changed({tag: flip(record.tag)})],
      ['iv', () => changed({iv: flip(record.iv)})],
      ['salt', () => withKdf({salt: flip(record.kdf.salt)})],
      ['root fingerprint', () => changed({rootFingerprint: other(record.rootFingerprint)})],
      ['agent CA fingerprint', () => changed({agentCaFingerprint: other(record.agentCaFingerprint)})]
    ]) {
      it(`refuses a changed ${label} with E_ESCROW_PASSPHRASE`, async () => {
        await assert.rejects(() => escrow.open(patch(), PASS), {code: 'E_ESCROW_PASSPHRASE'});
      });
    }

    for (const [label, patch] of [
      ['kdf name', () => withKdf({name: 'pbkdf2'})],
      ['N of 3', () => withKdf({N: 3})],
      ['N of 2^18', () => withKdf({N: 262144})],
      ['r of 4', () => withKdf({r: 4})],
      ['p of 2', () => withKdf({p: 2})],
      ['version 2', () => changed({version: 2})],
      ['12-byte tag', () => changed({tag: Buffer.from(record.tag, 'base64').subarray(0, 12).toString('base64')})],
      ['16-byte iv', () => changed({iv: Buffer.alloc(16).toString('base64')})]
    ]) {
      it(`refuses a record with a ${label} with E_ESCROW_RECORD`, async () => {
        await assert.rejects(() => escrow.open(patch(), PASS),
          {code: 'E_ESCROW_RECORD', message: 'The agent CA backup record is not valid.'});
      });
    }
  });

  describe('passphrases::', () => {
    const words = new Set(fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'lib', 'eff_large_wordlist.txt'), 'utf8')
      .split('\n').filter(Boolean).map((line) => line.split('\t')[1]));

    it('generatePassphrase gives 6 list words joined by single spaces', () => {
      const text = escrow.generatePassphrase();
      const parts = text.split(' ');
      assert.strictEqual(parts.length, 6);
      for (const w of parts) assert.ok(words.has(w), w);
      assert.strictEqual(text, escrow.normalize(text));
    });

    it('generatePassphrase gives 1000 values in 1000 calls', () => {
      const seen = new Set();
      for (let i = 0; i < 1000; i++) seen.add(escrow.generatePassphrase());
      assert.strictEqual(seen.size, 1000);
    });

    it('normalize trims, keeps case, and makes inner whitespace runs one space', () => {
      assert.strictEqual(escrow.normalize('  Crane \t\n MOSAIC   fluid  x '), 'Crane MOSAIC fluid x');
      // NFC: e plus a combining acute accent becomes one character.
      assert.strictEqual(escrow.normalize('café'), 'café');
    });

    it('checkPassphrase refuses 19 normalized characters and accepts 20', () => {
      assert.throws(() => escrow.checkPassphrase('a'.repeat(19)), {code: 'E_ESCROW_WEAK'});
      assert.throws(() => escrow.checkPassphrase(`   ${'a'.repeat(19)}   `), {code: 'E_ESCROW_WEAK'});
      assert.doesNotThrow(() => escrow.checkPassphrase('a'.repeat(20)));
    });
  });

  describe('restore::', () => {
    const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fog-escrow-restore-'));

    it('writes the four files, with 0600 keys (not on Windows)', async () => {
      const to = path.join(tmp(), 'pki');
      try {
        escrow.restore(to, await escrow.open(record, PASS));
        assert.deepStrictEqual(fs.readdirSync(to).sort(), Object.values(NAMES).sort());
        assert.deepStrictEqual(pems(to), pems(dir));
        if (process.platform !== 'win32') {
          for (const k of ['root.key', 'agent-ca.key']) assert.strictEqual(fs.statSync(path.join(to, k)).mode & 0o777, 0o600, k);
        }
      } finally {
        fs.rmSync(path.dirname(to), {recursive: true, force: true});
      }
    });

    it('throws when a CA file exists, and writes nothing', async () => {
      const to = tmp();
      try {
        fs.writeFileSync(path.join(to, 'agent-ca.pem'), 'old');
        const texts = await escrow.open(record, PASS);
        assert.throws(() => escrow.restore(to, texts), /already holds agent-ca\.pem/);
        assert.deepStrictEqual(fs.readdirSync(to), ['agent-ca.pem']);
      } finally {
        fs.rmSync(to, {recursive: true, force: true});
      }
    });
  });
});
