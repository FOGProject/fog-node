const assert = require('assert');

// The Activity summary (api/helpers/audit/summary.js): one plain sentence for an
// AuditLog row. It is a sync helper, called as the app calls it: .with() with
// no .now(). A helper that lost `sync: true` returns a Deferred, and the
// strictEqual assertions fail on it.
describe('Audit summary helper::', () => {
  const summary = (row) => sails.helpers.audit.summary.with({row});

  it('names a PUT on a labeled subject', () => {
    assert.strictEqual(summary({
      type: 'access.api', text: 'PUT /api/v1/host/abc', subjectType: 'host', subjectLabel: 'PC-01'
    }), 'Updated host "PC-01"');
  });

  it('names a DELETE with a count and no label', () => {
    assert.strictEqual(summary({
      type: 'access.api', text: 'DELETE /api/v1/image', subjectType: 'image', subjectId: '', affectedCount: 3
    }), 'Deleted image (3 records)');
  });

  it('names a POST with a count of 1 without the count', () => {
    assert.strictEqual(summary({
      type: 'access.api', text: 'POST /api/v1/host/bulk', subjectType: 'host', subjectId: '', affectedCount: 1
    }), 'Saved host');
  });

  it('names a renderable row by its event, subject and text', () => {
    assert.strictEqual(summary({
      type: 'agent.token', renderable: true, subjectType: 'agentenrolltoken', subjectLabel: 'lab', text: 'minted, 3 use(s)'
    }), 'Agent token, agentenrolltoken "lab": minted, 3 use(s)');
  });

  it('names agent.enroll, and an unknown event by its type', () => {
    assert.strictEqual(summary({type: 'agent.enroll', renderable: true, text: 'enrolled'}), 'Agent enrollment: enrolled');
    assert.strictEqual(summary({type: 'x.y', renderable: true, subjectType: 'host', subjectId: '7', text: 't'}), 'x.y, host #7: t');
  });

  it('gives a subject with an id and no label as type #id', () => {
    assert.strictEqual(summary({type: 'access.api', text: 'PATCH /api/v1/host/7', subjectType: 'host', subjectId: '7'}), 'Updated host #7');
  });

  it('leaves no trailing space for a row with no subject', () => {
    assert.strictEqual(summary({
      type: 'access.page', text: 'POST /account/preferences', subjectType: '', subjectId: ''
    }), 'Saved');
  });

  it('gives the stored text for any other row', () => {
    assert.strictEqual(summary({type: 'auth.login', text: 'signed in'}), 'signed in');
  });
});
