const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const x509 = require('@peculiar/x509');
const {ensurePki} = require('../../api/lib/agent-pki-files');
const {setupPki} = require('../../tools/setup/pki');
const {DAY_MS, ROOT_SETTING, importPair} = require('../../api/lib/agent-pki');
const support = require('../support/pki');

// The fog-agent PKI (the CAs, CSR signing and the key fingerprint), against the
// parameters in briefs/research/2026-11-10-agent-enroll-contract.md section 4.
describe('Agent PKI::', function () {
  this.timeout(120000);

  // A P-256 key made once with openssl, and its CSR with an empty subject: the
  // shape the Go agent sends (contract 4.3). The expected value came from
  //   openssl pkey -pubout -in key.pem | sha256sum
  const KEY_PEM = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIA/zitoMhNENczC8X+yhGOxTc+vfemF6Ol4GrxAmhU+aoAoGCCqGSM49
AwEHoUQDQgAE75L1JjW1oVpBfGnKgDRAzMoz0p23BFSXPZ77/EaPmcF7SgaviU+m
4NyQ/a8EMSwGi2shbr+1/1azw/rhgQD7mA==
-----END EC PRIVATE KEY-----
`;
  const CSR_PEM = `-----BEGIN CERTIFICATE REQUEST-----
MIG6MGICAQAwADBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABO+S9SY1taFaQXxp
yoA0QMzKM9KdtwRUlz2e+/xGj5nBe0oGr4lPpuDckP2vBDEsBotrIW6/tf9Ws8P6
4YEA+5igADAKBggqhkjOPQQDAgNIADBFAiA/xpFTadkakGKbeacybeykYXTqXOeV
N6M/cmtQjgdJ8gIhAOBb4zKxR50Hh3m3NWDCPQK/OG3cmj8QTzCFV8oY7LuI
-----END CERTIFICATE REQUEST-----
`;
  const EXPECTED_FP = '770066563cca51ea0ef2b6ae7be80bb955c137a61b292e23d058bbbc2ab1ec95';

  // The same CSR with its last signature byte changed: it parses, but the
  // self-signature does not verify.
  const badSignatureCsr = () => {
    const der = Buffer.from(CSR_PEM.replace(/-----[A-Z ]+-----|\s/g, ''), 'base64');
    der[der.length - 1] ^= 0x01;
    return `-----BEGIN CERTIFICATE REQUEST-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE REQUEST-----\n`;
  };

  // An RSA 2048 CSR with a subject that the server must ignore.
  const rsaCsr = async () => {
    const keys = await crypto.webcrypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1])
    }, true, ['sign', 'verify']);
    const csr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: 'CN=attacker, O=Evil', keys, signingAlgorithm: {name: 'RSASSA-PKCS1-v1_5'}
    });
    return csr.toString('pem');
  };

  const cert = (file) => new crypto.X509Certificate(fs.readFileSync(file));
  const ext = (c, type) => new x509.X509Certificate(c.raw).getExtension(type);
  const hashOf = (c) => new x509.X509Certificate(c.raw).signatureAlgorithm.hash.name;
  const keyBits = (c) => c.publicKey.asymmetricKeyDetails.modulusLength;
  const days = (c) => Math.round((Date.parse(c.validTo) - Date.parse(c.validFrom)) / DAY_MS);

  const fixtureDir = support.useFixture();

  // A copy of the fixture keeps its server certificate only if ensurePki gets
  // the fixture's SAN list (support.SANS).
  const ensure = (dir, opts = {}) => ensurePki(dir, Object.assign({sans: support.SANS}, opts));

  // Run fn against a private copy of the fixture, then remove it.
  const withCopy = async (fn) => {
    const dir = support.copy(fixtureDir());
    const before = sails.config.custom.pkiDir;
    sails.config.custom.pkiDir = dir;
    try {
      return await fn(dir);
    } finally {
      sails.config.custom.pkiDir = before;
      fs.rmSync(dir, {recursive: true, force: true});
    }
  };

  const exitOf = async (promise) => {
    try {
      await promise;
    } catch (err) {
      return err.exit || err.raw || err;
    }
    return 'no error';
  };
  const sign = (csrPem, hostId = '42') => sails.helpers.agent.signCsr.with({csrPem, hostId});

  describe('ensurePki::', () => {
    it('makes the seven files, and the keys are 0600 (not on Windows)', () => {
      const names = ['root.key', 'root.pem', 'agent-ca.key', 'agent-ca.pem', 'agent-ca-bundle.pem', 'server.key', 'server.pem'];
      assert.deepStrictEqual(fs.readdirSync(fixtureDir()).sort(), names.sort());
      if (process.platform !== 'win32') {
        for (const k of ['root.key', 'agent-ca.key', 'server.key']) {
          assert.strictEqual(fs.statSync(path.join(fixtureDir(),k)).mode & 0o777, 0o600, k);
        }
      }
    });

    it('gives the root the 1.6 subject, key size, validity and extensions', () => {
      const root = cert(path.join(fixtureDir(),'root.pem'));
      assert.strictEqual(root.subject.split('\n').join(','), 'CN=FOG Server CA,O=FOG Project,OU=FOG Root CA');
      assert.strictEqual(root.issuer, root.subject);
      assert.strictEqual(keyBits(root), 4096);
      assert.strictEqual(days(root), 10950);
      assert.strictEqual(root.ca, true);
      assert.ok(ext(root, x509.BasicConstraintsExtension).critical);
      const usage = ext(root, x509.KeyUsagesExtension);
      assert.ok(usage.critical);
      assert.strictEqual(usage.usages, x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign);
      assert.ok(ext(root, x509.SubjectKeyIdentifierExtension));
      assert.strictEqual(hashOf(root), 'SHA-512');
    });

    it('gives the agent CA the contract 4.1 subject, issuer, key size, validity and extensions', () => {
      const ca = cert(path.join(fixtureDir(),'agent-ca.pem'));
      const root = cert(path.join(fixtureDir(),'root.pem'));
      assert.strictEqual(ca.subject.split('\n').join(','), 'CN=FOG Agent CA,O=FOG Project,OU=FOG Agent');
      assert.strictEqual(ca.issuer, root.subject);
      assert.strictEqual(keyBits(ca), 4096);
      assert.strictEqual(days(ca), 10950);
      const bc = ext(ca, x509.BasicConstraintsExtension);
      assert.ok(bc.critical && bc.ca);
      assert.strictEqual(bc.pathLength, 0);
      assert.strictEqual(hashOf(ca), 'SHA-512');
      const usage = ext(ca, x509.KeyUsagesExtension);
      assert.ok(usage.critical);
      assert.strictEqual(usage.usages, x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign);
      assert.ok(ext(ca, x509.SubjectKeyIdentifierExtension));
      assert.deepStrictEqual(Array.from(ext(ca, x509.ExtendedKeyUsageExtension).usages), ['1.3.6.1.5.5.7.3.2']);
      assert.ok(ca.checkIssued(root) && ca.verify(root.publicKey));
    });

    it('writes the bundle as the agent CA, then the root', () => {
      assert.strictEqual(fs.readFileSync(path.join(fixtureDir(),'agent-ca-bundle.pem'), 'utf8'),
        fs.readFileSync(path.join(fixtureDir(),'agent-ca.pem'), 'utf8') + fs.readFileSync(path.join(fixtureDir(),'root.pem'), 'utf8'));
    });

    it('changes no file on a second call', () => withCopy(async (dir) => {
      const snap = () => fs.readdirSync(dir).map((n) => {
        const p = path.join(dir, n);
        return [n, fs.statSync(p).mtimeMs, fs.readFileSync(p, 'utf8')];
      });
      const first = snap();
      await ensure(dir);
      assert.deepStrictEqual(snap(), first);
    }));

    it('re-creates the agent CA files under the same root', () => withCopy(async (dir) => {
      const rootBefore = fs.readFileSync(path.join(dir, 'root.pem'), 'utf8');
      const oldCa = fs.readFileSync(path.join(dir, 'agent-ca.pem'), 'utf8');
      fs.unlinkSync(path.join(dir, 'agent-ca.pem'));
      fs.unlinkSync(path.join(dir, 'agent-ca.key'));
      await ensure(dir);
      assert.strictEqual(fs.readFileSync(path.join(dir, 'root.pem'), 'utf8'), rootBefore);
      const ca = cert(path.join(dir, 'agent-ca.pem'));
      assert.ok(ca.checkIssued(cert(path.join(dir, 'root.pem'))));
      assert.notStrictEqual(fs.readFileSync(path.join(dir, 'agent-ca.pem'), 'utf8'), oldCa);
    }));

    it('renames the old agent CA pair, re-mints and rewrites the bundle when the root does not verify it', () => withCopy(async (dir) => {
      // A certificate from another root takes the place of agent-ca.pem.
      const other = await support.foreign();
      const foreign = fs.readFileSync(path.join(other, 'agent-ca.pem'), 'utf8');
      fs.writeFileSync(path.join(dir, 'agent-ca.pem'), foreign);
      const oldKey = fs.readFileSync(path.join(dir, 'agent-ca.key'), 'utf8');
      await ensure(dir);
      const names = fs.readdirSync(dir);
      const stamped = (base) => names.filter((n) => new RegExp(`^${base}\\.\\d{14}$`).test(n));
      assert.strictEqual(stamped('agent-ca\\.pem').length, 1);
      assert.strictEqual(stamped('agent-ca\\.key').length, 1);
      assert.strictEqual(fs.readFileSync(path.join(dir, stamped('agent-ca\\.pem')[0]), 'utf8'), foreign);
      assert.strictEqual(fs.readFileSync(path.join(dir, stamped('agent-ca\\.key')[0]), 'utf8'), oldKey);
      const root = cert(path.join(dir, 'root.pem'));
      const ca = cert(path.join(dir, 'agent-ca.pem'));
      assert.ok(ca.checkIssued(root) && ca.verify(root.publicKey));
      assert.strictEqual(fs.readFileSync(path.join(dir, 'agent-ca-bundle.pem'), 'utf8'),
        fs.readFileSync(path.join(dir, 'agent-ca.pem'), 'utf8') + fs.readFileSync(path.join(dir, 'root.pem'), 'utf8'));
    }));

    it('renames an existing root.key before it makes a new root', () => withCopy(async (dir) => {
      const oldKey = fs.readFileSync(path.join(dir, 'root.key'), 'utf8');
      const oldRoot = fs.readFileSync(path.join(dir, 'root.pem'), 'utf8');
      fs.unlinkSync(path.join(dir, 'root.pem'));
      await ensure(dir);
      const kept = fs.readdirSync(dir).filter((n) => /^root\.key\.\d{14}$/.test(n));
      assert.strictEqual(kept.length, 1);
      assert.strictEqual(fs.readFileSync(path.join(dir, kept[0]), 'utf8'), oldKey);
      assert.notStrictEqual(fs.readFileSync(path.join(dir, 'root.pem'), 'utf8'), oldRoot);
      assert.notStrictEqual(fs.readFileSync(path.join(dir, 'root.key'), 'utf8'), oldKey);
      // The old agent CA no longer verifies, so it was re-made under the new root.
      assert.ok(cert(path.join(dir, 'agent-ca.pem')).checkIssued(cert(path.join(dir, 'root.pem'))));
    }));

    it('throws on a re-mint when root.key is missing, and never re-makes an existing root.pem', () => withCopy(async (dir) => {
      const rootBefore = fs.readFileSync(path.join(dir, 'root.pem'), 'utf8');
      fs.unlinkSync(path.join(dir, 'root.key'));
      await ensure(dir);
      assert.strictEqual(fs.readFileSync(path.join(dir, 'root.pem'), 'utf8'), rootBefore);
      fs.unlinkSync(path.join(dir, 'agent-ca.pem'));
      await assert.rejects(() => ensure(dir), /root\.key/);
    }));

    describe('server certificate::', () => {
      const server = (dir) => cert(path.join(dir, 'server.pem'));
      const stamped = (dir, base) => fs.readdirSync(dir).filter((n) => new RegExp(`^${base}\\.\\d{14}$`).test(n));
      const snap = (dir) => fs.readdirSync(dir).sort().map((n) => [n, fs.readFileSync(path.join(dir, n), 'utf8')]);

      it('makes the server certificate RSA 2048, SHA-256, 825 days, CA false, serverAuth, with dNSName and iPAddress SANs, signed directly by the root', () => {
        const c = server(fixtureDir());
        const root = cert(path.join(fixtureDir(), 'root.pem'));
        assert.strictEqual(c.subject.split('\n').join(','), 'CN=localhost,O=FOG Project');
        assert.strictEqual(c.issuer, root.subject);
        assert.ok(c.checkIssued(root) && c.verify(root.publicKey));
        assert.strictEqual(keyBits(c), 2048);
        assert.strictEqual(days(c), 825);
        assert.strictEqual(hashOf(c), 'SHA-256');
        assert.strictEqual(c.ca, false);
        const bc = ext(c, x509.BasicConstraintsExtension);
        assert.ok(bc.critical && !bc.ca);
        const usage = ext(c, x509.KeyUsagesExtension);
        assert.ok(usage.critical);
        assert.strictEqual(usage.usages, x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment);
        assert.deepStrictEqual(Array.from(ext(c, x509.ExtendedKeyUsageExtension).usages), ['1.3.6.1.5.5.7.3.1']);
        // A name is a dNSName entry and an address an iPAddress entry.
        assert.strictEqual(c.subjectAltName, 'DNS:localhost, IP Address:127.0.0.1');
        // The key belongs to the certificate.
        const key = crypto.createPrivateKey(fs.readFileSync(path.join(fixtureDir(), 'server.key')));
        assert.ok(crypto.createPublicKey(key).equals(c.publicKey));
      });

      it('lists the default names without a SAN list', () => withCopy(async (dir) => {
        fs.unlinkSync(path.join(dir, 'server.pem'));
        await ensurePki(dir);
        const san = server(dir).subjectAltName;
        assert.ok(san.includes('DNS:localhost') && san.includes('IP Address:127.0.0.1'));
        assert.ok(san.toLowerCase().includes(os.hostname().toLowerCase()));
      }));

      it('makes the pair again, and renames the old one, when the SAN set changes', () => withCopy(async (dir) => {
        const oldPem = fs.readFileSync(path.join(dir, 'server.pem'), 'utf8');
        const oldKey = fs.readFileSync(path.join(dir, 'server.key'), 'utf8');
        await ensure(dir, {sans: [...support.SANS, 'fog.example']});
        assert.strictEqual(server(dir).subjectAltName, 'DNS:localhost, IP Address:127.0.0.1, DNS:fog.example');
        assert.ok(server(dir).checkIssued(cert(path.join(dir, 'root.pem'))));
        assert.strictEqual(fs.readFileSync(path.join(dir, stamped(dir, 'server\\.pem')[0]), 'utf8'), oldPem);
        assert.strictEqual(fs.readFileSync(path.join(dir, stamped(dir, 'server\\.key')[0]), 'utf8'), oldKey);
        assert.strictEqual(stamped(dir, 'server\\.pem').length, 1);
      }));

      it('keeps the pair when only the order, the case or the IPv6 spelling changes', () => withCopy(async (dir) => {
        await ensure(dir, {sans: ['localhost', '127.0.0.1', '::1', 'Fog.Example']});
        const before = snap(dir);
        await ensure(dir, {sans: ['fog.example', '0:0:0:0:0:0:0:1', 'LOCALHOST', '127.0.0.1']});
        assert.deepStrictEqual(snap(dir), before);
        // A different address is a different set.
        await ensure(dir, {sans: ['localhost', '127.0.0.1', '::2', 'fog.example']});
        assert.strictEqual(stamped(dir, 'server\\.pem').length, 1);
      }));

      it('makes the pair again when fewer than 30 days remain', () => withCopy(async (dir) => {
        // A server certificate for the same names, signed by the root, valid 10 more days.
        const rootKeys = await importPair(crypto.createPrivateKey(fs.readFileSync(path.join(dir, 'root.key'))), 'SHA-256');
        const keys = await importPair(crypto.createPrivateKey(fs.readFileSync(path.join(dir, 'server.key'))), 'SHA-256');
        const near = await x509.X509CertificateGenerator.create({
          serialNumber: '01',
          subject: 'CN=localhost, O=FOG Project',
          issuer: new x509.X509Certificate(fs.readFileSync(path.join(dir, 'root.pem'), 'utf8')).subjectName,
          notBefore: new Date(Date.now() - DAY_MS),
          notAfter: new Date(Date.now() + 10 * DAY_MS),
          signingAlgorithm: {name: 'RSASSA-PKCS1-v1_5'},
          publicKey: keys.publicKey,
          signingKey: rootKeys.privateKey,
          extensions: [new x509.SubjectAlternativeNameExtension([{type: 'dns', value: 'localhost'}, {type: 'ip', value: '127.0.0.1'}])]
        });
        fs.writeFileSync(path.join(dir, 'server.pem'), near.toString('pem') + '\n');
        await ensure(dir);
        assert.strictEqual(stamped(dir, 'server\\.pem').length, 1);
        assert.ok(days(server(dir)) === 825 && Date.parse(server(dir).validTo) - Date.now() > 800 * DAY_MS);
      }));

      it('makes the pair again under a new root', () => withCopy(async (dir) => {
        fs.unlinkSync(path.join(dir, 'root.pem'));
        await ensure(dir);
        assert.ok(server(dir).checkIssued(cert(path.join(dir, 'root.pem'))));
        assert.ok(server(dir).verify(cert(path.join(dir, 'root.pem')).publicKey));
      }));

      it('throws on a re-issue when root.key is missing', () => withCopy(async (dir) => {
        fs.unlinkSync(path.join(dir, 'root.key'));
        await ensure(dir);
        fs.unlinkSync(path.join(dir, 'server.pem'));
        await assert.rejects(() => ensure(dir), /root\.key/);
      }));
    });
  });

  describe('signCsr::', () => {
    it('signs the agent-shaped P-256 CSR with the contract 4.2 leaf', async () => {
      const {leafPem, chainPem} = await sign(CSR_PEM, '42');
      const leaf = new crypto.X509Certificate(leafPem);
      const ca = cert(path.join(fixtureDir(),'agent-ca.pem'));
      assert.strictEqual(leaf.subject.split('\n').join(','), 'CN=fog-agent host 42,O=FOG Project,OU=FOG Agent');
      assert.strictEqual(leaf.issuer, ca.subject);
      assert.strictEqual(days(leaf), 365);
      assert.ok(Math.abs(Date.parse(leaf.validFrom) - Date.now()) < 120000, 'valid from now');
      assert.strictEqual(leaf.ca, false);
      assert.strictEqual(hashOf(leaf), 'SHA-256');
      assert.ok(leaf.checkIssued(ca) && leaf.verify(ca.publicKey));
      const x = new x509.X509Certificate(leafPem);
      assert.ok(x.getExtension(x509.BasicConstraintsExtension).critical);
      const usage = x.getExtension(x509.KeyUsagesExtension);
      assert.ok(usage.critical);
      assert.strictEqual(usage.usages, x509.KeyUsageFlags.digitalSignature);
      assert.deepStrictEqual(Array.from(x.getExtension(x509.ExtendedKeyUsageExtension).usages), ['1.3.6.1.5.5.7.3.2']);
      assert.ok(x.getExtension(x509.SubjectKeyIdentifierExtension));
      assert.ok(x.getExtension(x509.AuthorityKeyIdentifierExtension).keyId);
      assert.strictEqual(x.getExtension(x509.SubjectAlternativeNameExtension), null);
      assert.strictEqual(leaf.subjectAltName, undefined);
      // The chain is the agent CA only, not the root.
      assert.strictEqual(chainPem, fs.readFileSync(path.join(fixtureDir(),'agent-ca.pem'), 'utf8'));
    });

    it('signs an RSA CSR and ignores the CSR subject', async () => {
      const {leafPem} = await sign(await rsaCsr(), '7');
      const leaf = new crypto.X509Certificate(leafPem);
      assert.strictEqual(leaf.subject.split('\n').join(','), 'CN=fog-agent host 7,O=FOG Project,OU=FOG Agent');
      assert.ok(leaf.verify(cert(path.join(fixtureDir(),'agent-ca.pem')).publicKey));
    });

    it('throws badCsr for a bad signature and for text that is not a CSR', async () => {
      assert.strictEqual(await exitOf(sign(badSignatureCsr())), 'badCsr');
      assert.strictEqual(await exitOf(sign('hello')), 'badCsr');
      assert.strictEqual(await exitOf(sign('-----BEGIN CERTIFICATE REQUEST-----\nAAAA\n-----END CERTIFICATE REQUEST-----\n')), 'badCsr');
    });

    it('throws badHostId for a host id that is not 1 to 10 digits', async () => {
      for (const bad of ['abc', '12345678901', '1 2', '1\n', '1/OU=x']) {
        assert.strictEqual(await exitOf(sign(CSR_PEM, bad)), 'badHostId', JSON.stringify(bad));
      }
    });

    it('throws notConfigured when agent-ca.key is missing', () => withCopy(async (dir) => {
      fs.unlinkSync(path.join(dir, 'agent-ca.key'));
      assert.strictEqual(await exitOf(sign(CSR_PEM)), 'notConfigured');
    }));

    it('throws signFailed when the agent CA does not verify against the root', () => withCopy(async (dir) => {
      const other = await support.foreign();
      fs.copyFileSync(path.join(other, 'root.pem'), path.join(dir, 'root.pem'));
      // The Setting records the foreign root, so the guard passes and the CA check fails.
      await support.setRoot(support.rootOf(other));
      try {
        assert.strictEqual(await exitOf(sign(CSR_PEM)), 'signFailed');
      } finally {
        await support.setRoot(support.rootOf(fixtureDir()));
      }
    }));

    it('throws notConfigured when root.pem differs from the recorded root', () => withCopy(async (dir) => {
      const other = await support.foreign();
      fs.copyFileSync(path.join(other, 'root.pem'), path.join(dir, 'root.pem'));
      assert.strictEqual(await exitOf(sign(CSR_PEM)), 'notConfigured');
    }));

    it('signs when the Setting is unset', () => withCopy(async () => {
      await support.setRoot(undefined);
      try {
        const {leafPem} = await sign(CSR_PEM);
        assert.ok(new crypto.X509Certificate(leafPem));
      } finally {
        await support.setRoot(support.rootOf(fixtureDir()));
      }
    }));
  });

  describe('root guard::', () => {
    const snapshot = (dir) => fs.readdirSync(dir).sort().map((n) => {
      const p = path.join(dir, n);
      return [n, fs.statSync(p).mtimeMs, fs.readFileSync(p, 'utf8')];
    });
    const recorded = async () => (await Setting.findOne({name: ROOT_SETTING})).value;
    const setup = (pkiDir, extra = {}) => setupPki(Object.assign({
      pkiDir, newRoot: false, settings: sails.models.setting, log: () => {}, command: 'setup', sans: support.SANS
    }, extra));
    // Run fn with an empty temp folder, then remove it.
    const withEmpty = async (fn) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fog-pki-empty-'));
      try {
        return await fn(dir);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    };
    // setupPki writes the Setting, so put the fixture value back after each test.
    afterEach(() => support.setRoot(support.rootOf(fixtureDir())));

    it('ensurePki with the matching fingerprint changes no file and returns it', () => withCopy(async (dir) => {
      const before = snapshot(dir);
      const expectedRoot = support.rootOf(dir);
      assert.deepStrictEqual(await ensure(dir, {expectedRoot}), {rootFingerprint: expectedRoot});
      assert.deepStrictEqual(snapshot(dir), before);
    }));

    it('ensurePki throws E_AGENT_ROOT_MISSING and changes no file when root.pem is gone', () => withCopy(async (dir) => {
      const expectedRoot = support.rootOf(dir);
      fs.unlinkSync(path.join(dir, 'root.pem'));
      const before = snapshot(dir);
      await assert.rejects(() => ensurePki(dir, {expectedRoot}), {code: 'E_AGENT_ROOT_MISSING'});
      assert.deepStrictEqual(snapshot(dir), before);
    }));

    it('ensurePki throws E_AGENT_ROOT_MISMATCH and changes no file for another root', () => withCopy(async (dir) => {
      const expectedRoot = support.rootOf(dir);
      fs.copyFileSync(path.join(await support.foreign(), 'root.pem'), path.join(dir, 'root.pem'));
      const before = snapshot(dir);
      await assert.rejects(() => ensurePki(dir, {expectedRoot}), {code: 'E_AGENT_ROOT_MISMATCH'});
      assert.deepStrictEqual(snapshot(dir), before);
    }));

    it('ensurePki with no expectedRoot makes the missing root as before', () => withEmpty(async (dir) => {
      const {rootFingerprint} = await ensure(dir);
      assert.strictEqual(rootFingerprint, support.rootOf(dir));
    }));

    it('setupPki refuses an empty folder while the Setting is set, with the restore message', () => withEmpty(async (dir) => {
      const expected = support.rootOf(fixtureDir());
      await assert.rejects(() => setup(dir), (err) => {
        assert.strictEqual(err.code, 'E_AGENT_ROOT_MISSING');
        assert.ok(err.message.includes(expected));
        assert.ok(err.message.includes(`Restore the pki folder from your backup to ${dir}, then run setup again.`));
        assert.ok(err.message.includes('run: npm run setup -- --new-agent-root'));
        assert.ok(err.message.indexOf('Restore the pki') < err.message.indexOf('start over'));
        return true;
      });
      assert.deepStrictEqual(fs.readdirSync(dir), []);
      assert.strictEqual(await recorded(), expected);
    }));

    it('setupPki names setup:dev in its message for command setup:dev', () => withEmpty(async (dir) => {
      await assert.rejects(() => setup(dir, {command: 'setup:dev'}), /npm run setup:dev -- --new-agent-root/);
    }));

    it('setupPki names both fingerprints for a mismatch', () => withCopy(async (dir) => {
      fs.copyFileSync(path.join(await support.foreign(), 'root.pem'), path.join(dir, 'root.pem'));
      await assert.rejects(() => setup(dir), (err) => {
        assert.strictEqual(err.code, 'E_AGENT_ROOT_MISMATCH');
        assert.ok(err.message.includes(support.rootOf(fixtureDir())));
        assert.ok(err.message.includes(support.rootOf(dir)));
        return true;
      });
    }));

    it('setupPki with newRoot on an empty folder makes a root, renames nothing and updates the Setting', () => withEmpty(async (dir) => {
      const lines = [];
      const {rootFingerprint} = await setup(dir, {newRoot: true, log: (l) => lines.push(l)});
      assert.deepStrictEqual(fs.readdirSync(dir).sort(),
        ['agent-ca-bundle.pem', 'agent-ca.key', 'agent-ca.pem', 'root.key', 'root.pem', 'server.key', 'server.pem']);
      assert.strictEqual(rootFingerprint, support.rootOf(dir));
      assert.notStrictEqual(rootFingerprint, support.rootOf(fixtureDir()));
      assert.strictEqual(await recorded(), rootFingerprint);
      assert.strictEqual(lines.length, 1);
      assert.ok(lines[0].startsWith('A new agent root was made.'));
    }));

    it('setupPki with newRoot on a full folder renames the four files and makes new CAs', () => withCopy(async (dir) => {
      const old = {};
      for (const n of ['root.pem', 'root.key', 'agent-ca.pem', 'agent-ca.key']) old[n] = fs.readFileSync(path.join(dir, n), 'utf8');
      const {rootFingerprint} = await setup(dir, {newRoot: true});
      const names = fs.readdirSync(dir);
      for (const n of Object.keys(old)) {
        const kept = names.filter((x) => new RegExp(`^${n.replace('.', '\\.')}\\.\\d{14}$`).test(x));
        assert.strictEqual(kept.length, 1, n);
        assert.strictEqual(fs.readFileSync(path.join(dir, kept[0]), 'utf8'), old[n]);
        assert.notStrictEqual(fs.readFileSync(path.join(dir, n), 'utf8'), old[n]);
      }
      assert.notStrictEqual(rootFingerprint, support.rootOf(fixtureDir()));
      assert.strictEqual(await recorded(), rootFingerprint);
      assert.ok(cert(path.join(dir, 'agent-ca.pem')).checkIssued(cert(path.join(dir, 'root.pem'))));
    }));

    it('setupPki with newRoot and no Setting is a plain run: it renames nothing', () => withCopy(async (dir) => {
      await support.setRoot(undefined);
      const before = snapshot(dir);
      await setup(dir, {newRoot: true});
      assert.deepStrictEqual(snapshot(dir), before);
      assert.strictEqual(await recorded(), support.rootOf(dir));
    }));

    it('setupPki with no Setting records the root of an existing folder and changes no file', () => withCopy(async (dir) => {
      await support.setRoot(undefined);
      const before = snapshot(dir);
      const {rootFingerprint} = await setup(dir);
      assert.deepStrictEqual(snapshot(dir), before);
      assert.strictEqual(rootFingerprint, support.rootOf(dir));
      assert.strictEqual(await recorded(), rootFingerprint);
    }));

    it('setupPki on a second run with the Setting set succeeds and changes no file', () => withCopy(async (dir) => {
      const before = snapshot(dir);
      await setup(dir);
      assert.deepStrictEqual(snapshot(dir), before);
    }));
  });

  describe('keyFingerprint::', () => {
    const fp = (pem) => sails.helpers.agent.keyFingerprint(pem);

    it('hashes the public key PEM text: the openssl test vector', () => {
      assert.strictEqual(fp(CSR_PEM), EXPECTED_FP);
    });

    it('gives the same value for the key\'s CSR and its signed leaf', async () => {
      const {leafPem} = await sign(CSR_PEM);
      assert.strictEqual(fp(leafPem), EXPECTED_FP);
    });

    it('is not the hash of the DER bytes', () => {
      const der = crypto.createPublicKey(KEY_PEM).export({type: 'spki', format: 'der'});
      assert.notStrictEqual(crypto.createHash('sha256').update(der).digest('hex'), EXPECTED_FP);
    });

    it('exits invalid for text that is neither', () => {
      assert.throws(() => fp('hello'), (err) => err.exit === 'invalid');
    });
  });
});
