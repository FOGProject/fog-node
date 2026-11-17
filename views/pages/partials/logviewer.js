(function($) {
  // The Log Viewer page (GET /logviewer, views/pages/logviewer.ejs; 1.6
  // fog.logviewer.list.js). It reads POST /api/v1/log/tail on load, on any
  // change, and every 10 seconds while not paused. $.ajax, not fetch: the
  // route is csrf: false, but jQuery sends X-Requested-With as the other pages
  // do. The lines go in with textContent, never innerHTML: a log line is data.
  const INTERVAL = 10000;
  const $pre = $('#logviewer-pre');
  const $status = $('#logviewer-status');
  const $pause = $('#logviewer-pause');
  let timer = null;
  let paused = false;
  // The newest request. A slower, older answer is ignored.
  let latest = 0;

  function load() {
    const id = ++latest;
    $.ajax({
      url: '/api/v1/log/tail',
      method: 'POST',
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify({
        file: $('#logviewer-file').val(),
        lines: Number($('#logviewer-lines').val()),
        reverse: $('#logviewer-reverse').prop('checked')
      })
    }).done((res) => {
      if (id !== latest) { return; }
      $status.text('');
      $pre[0].textContent = res.lines.join('\n');
    }).fail((xhr) => {
      if (id !== latest) { return; }
      $status.text((xhr.responseJSON && xhr.responseJSON.error) || 'Cannot read the log file.');
    });
  }

  function stop() {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  function start() {
    stop();
    timer = setInterval(load, INTERVAL);
  }

  $('#logviewer-file, #logviewer-lines, #logviewer-reverse').on('change', load);
  $pause.on('click', () => {
    paused = !paused;
    $pause.text(paused ? 'Resume Reload' : 'Pause Reload');
    if (paused) {
      stop();
    } else {
      load();
      start();
    }
  });
  $(window).on('pagehide', stop);

  load();
  start();
})(jQuery);
