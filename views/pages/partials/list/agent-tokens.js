(function($) {
  // The Agent Enrollment Tokens list (GET /hosts/agentTokens; 1.6
  // fog.host.agentTokens.js). One GET fills the table. "Create token" posts
  // to POST /api/v1/agent/token and shows the token once. "Revoke selected"
  // calls DELETE /api/v1/agent/token/<id> once per selected row.
  // A server value shows as text, never as markup (window.fogTextCell).

  const pad = (n) => String(n).padStart(2, '0');

  // A datetime-local value (the browser's own zone), seven days from now.
  function defaultExpires() {
    let d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // The one time the token is on screen. The modal is removed from the page
  // when it closes, and nothing stores the token.
  function showToken(token) {
    let origin = window.location.origin;
    let body = document.createElement('div');
    body.innerHTML =
      '<p>Copy it now. It is not stored and cannot be shown again.</p>' +
      '<div class="input-group">' +
        '<input type="text" id="mintedToken" class="form-control font-monospace" readonly>' +
        '<button type="button" id="copyMintedToken" class="btn btn-outline-secondary">Copy</button>' +
      '</div>' +
      '<p class="mt-3 mb-0"><code id="mintedCommand"></code></p>' +
      '<p class="mt-2 mb-0"><a href="/management/other/ca.cert.pem" download>Download the CA certificate</a></p>';
    body.querySelector('#mintedToken').value = token;
    body.querySelector('#mintedCommand').textContent =
      'fog-agent enroll --server ' + origin + ' --ca ca.cert.pem --token ' + token;
    body.querySelector('#copyMintedToken').addEventListener('click', () => {
      let field = body.querySelector('#mintedToken');
      field.select();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(token).catch(() => {});
      } else {
        document.execCommand('copy');
      }
    });
    window.fogModal({
      type: 'success',
      title: 'Enrollment Token',
      body: body,
      confirmText: 'Done',
      cancelText: 'Close',
      onConfirm: function() { return true; }
    });
  }

  // The "Create token" modal (1.6 mintModal).
  function openMint(dt) {
    let body = document.createElement('div');
    body.innerHTML =
      '<div class="row mb-3"><label class="col-sm-3 col-form-label" for="tokenName">Name</label>' +
        '<div class="col-sm-9"><input type="text" class="form-control" id="tokenName" maxlength="191" required' +
        ' placeholder="What this token is for"></div></div>' +
      '<div class="row mb-3"><label class="col-sm-3 col-form-label" for="tokenUses">Uses</label>' +
        '<div class="col-sm-9"><div class="input-group">' +
          '<input type="number" class="form-control" id="tokenUses" min="1" value="1" required>' +
          '<div class="input-group-text"><input type="checkbox" class="form-check-input mt-0" id="tokenUnlimited" value="1">' +
          ' <label for="tokenUnlimited" class="ms-1">Unlimited</label></div>' +
        '</div></div></div>' +
      '<div class="row mb-3"><label class="col-sm-3 col-form-label" for="tokenExpires">Expires</label>' +
        '<div class="col-sm-9"><input type="datetime-local" class="form-control" id="tokenExpires" required></div></div>' +
      '<p class="text-muted mb-0">An expiry is required. The token approves enrollments until it is spent or expires; ' +
        'revoke it here at any time.</p>';
    body.querySelector('#tokenExpires').value = defaultExpires();
    let uses = body.querySelector('#tokenUses');
    body.querySelector('#tokenUnlimited').addEventListener('change', (e) => { uses.disabled = e.target.checked; });

    let minted = null;
    let ctrl = window.fogModal({
      type: 'primary',
      title: 'Create Enrollment Token',
      body: body,
      confirmText: 'Create',
      // A 400 keeps the modal open (false) so the form can be fixed.
      onConfirm: function(wrap) {
        let unlimited = wrap.querySelector('#tokenUnlimited').checked;
        let payload = {
          name: wrap.querySelector('#tokenName').value,
          uses: unlimited ? -1 : parseInt(wrap.querySelector('#tokenUses').value, 10),
          // The browser's own zone.
          expires: new Date(wrap.querySelector('#tokenExpires').value).getTime()
        };
        return new Promise((resolve) => {
          $.ajax({
            url: '/api/v1/agent/token',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload),
            success: function(res) {
              minted = res && res.token;
              resolve(true);
            },
            error: function(xhr) {
              window.fogToast('error', window.fogErrorOf(xhr), 'Create Token Fail');
              resolve(false);
            }
          });
        });
      }
    });
    // The token shows after this modal has gone, so two modals never overlap.
    ctrl.el.addEventListener('hidden.bs.modal', () => {
      if (!minted) { return; }
      showToken(minted);
      minted = null;
      dt.ajax.reload(null, false);
    });
  }

  // Asks, then revokes each selected row in turn, then reloads (fogRunEach).
  function revoke(dt) {
    window.fogRunEach(dt, {
      confirm: (n) => ({
        danger: true,
        title: 'Revoke tokens',
        body: 'A revoked token can no longer enroll an agent. Agents already enrolled keep their certificates.',
        confirmText: 'Revoke ' + n + ' token(s)'
      }),
      request: (id) => ({url: '/api/v1/agent/token/' + encodeURIComponent(id), type: 'DELETE'}),
      verb: 'revoked',
      success: {text: 'Revoked selected tokens!'}
    });
  }

  let table = $('#listtable').registerTable(undefined, {
    order: [
      [5, 'desc']
    ],
    extraButtons: [
      {
        name: 'mint',
        text: '<i class="fa fa-key"></i> Create token',
        action: function(e, dt) { openMint(dt); }
      },
      {
        name: 'revoke',
        text: '<i class="fa fa-trash"></i> Revoke selected',
        enabled: false,
        action: function(e, dt) { revoke(dt); }
      }
    ],
    columns: [
      {data: 'name', render: window.fogTextCell},
      {data: 'state', render: window.fogTextCell},
      {
        data: 'uses',
        render: function(data, type) {
          return type === 'display' && data === -1 ? 'Unlimited' : data;
        }
      },
      {data: 'expires', render: window.fogWhenCell},
      {data: 'createdBy', render: window.fogTextCell},
      {data: 'createdAt', render: window.fogWhenCell}
    ],
    rowId: 'id',
    serverSide: false,
    ajax: {
      type: 'get',
      url: '/api/v1/agent/tokens',
      dataSrc: 'data'
    }
  });

  function refresh() {
    table.button('revoke:name').enable(table.rows({selected: true}).count() > 0);
  }
  table.on('select.dt deselect.dt draw.dt', refresh);
  refresh();
})(jQuery);
