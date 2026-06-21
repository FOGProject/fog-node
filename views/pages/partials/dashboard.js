(function($) {
  // Percentage helper for doughnut tooltips (Chart.js v4).
  function pctLabel(context) {
    let val = Number(context.parsed) || 0,
      total = context.dataset.data.reduce((a, b) => a + Number(b), 0),
      pct = total ? (val / total * 100).toFixed(1) : 0;
    return ` ${context.label}: ${pct}%`;
  }

  // Activity Usage
  let qavail = Number($('#avail').val()) || 0,
    qactive = Number($('#active').val()) || 0,
    qstaged = Number($('#staged').val()) || 0,
    qtotal = qavail + qactive + qstaged,
    activeUsageCanvas = $('#activityUsage').get(0);
  if (activeUsageCanvas) {
    // Empty state: a 0/0/0 doughnut renders blank, so when there's no capacity
    // and no tasks show a single neutral "No activity" ring instead of nothing.
    let activityData = qtotal > 0
      ? {
        labels: [`Available: ${qavail}`, `Active: ${qactive}`, `Staged: ${qstaged}`],
        datasets: [{ data: [qavail, qactive, qstaged], backgroundColor: ['#28a745', '#dc3545', '#007bff'] }]
      }
      : {
        labels: ['No activity'],
        datasets: [{ data: [1], backgroundColor: ['#adb5bd'] }]
      };
    new Chart(activeUsageCanvas.getContext('2d'), {
      type: 'doughnut',
      data: activityData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: pctLabel } }
        }
      }
    });
  }

  // Disk Usage
  let free = Number($('#free').val()) || 0,
    used = Number($('#used').val()) || 0,
    hFree = $.readableBytes(free),
    hUsed = $.readableBytes(used),
    total = free + used,
    freePct = total ? (free / total * 100).toFixed(1) : 0,
    usedPct = total ? (used / total * 100).toFixed(1) : 0,
    diskUsageCanvas = $('#diskUsage').get(0);
  if (diskUsageCanvas) {
    new Chart(diskUsageCanvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: [
          `Free: ${hFree} (${freePct}%)`,
          `Used: ${hUsed} (${usedPct}%)`
        ],
        datasets: [{
          data: [free, used],
          backgroundColor: ['#28a745', '#dc3545']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: pctLabel } }
        }
      }
    });
  }

  // Task History (category x-axis -> no time adapter needed)
  let taskHistoryChart,
    taskHistoryTimeout;

  function historyCanvas(taskChartData) {
    let history = $('#taskHistory').get(0);
    if (!history) return;
    if (!taskHistoryChart) {
      taskHistoryChart = new Chart(history.getContext('2d'), {
        type: 'line',
        data: taskChartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { beginAtZero: true, min: 0, ticks: { precision: 0 } } }
        }
      });
    } else {
      taskHistoryChart.data = taskChartData;
      taskHistoryChart.update('none');
    }
  }

  function updateHistory(period) {
    $.ajax({
      url: '/task-history',
      type: 'post',
      data: { period },
      dataType: 'json',
      success: function(data) {
        historyCanvas({
          labels: data.dates,
          datasets: [{ label: 'Tasks', data: data.data, fill: false }]
        });
      }
    });
  }

  function getTInterval() {
    let val = $('.taskDayFilters.active').attr('length');
    switch (val) {
      case '-1': updateHistory(365); break;
      case '2': updateHistory(60); break;
      case '3': updateHistory(90); break;
      case '6': updateHistory(183); break;
      default: updateHistory(30);
    }
    taskHistoryTimeout = setTimeout(getTInterval, 3000);
  }

  $('.taskDayFilters').on('click', function(e) {
    e.preventDefault();
    $('.taskDayFilters.active').removeClass('active');
    $(this).addClass('active');
    if (taskHistoryTimeout) clearTimeout(taskHistoryTimeout);
    getTInterval();
  });

  if ($('#taskHistory').length) getTInterval();

  // Bandwidth: poll live interface stats into a rolling buffer and DISPLAY only
  // the selected window. We retain up to the largest selectable window (1 hour)
  // regardless of what's shown, so switching to a longer range instantly shows
  // the history we already collected instead of starting over from the smaller
  // window's oldest point. Purely client-side (matches the 1.x 2m/5m/10m/30m/1h).
  let BANDWIDTH_MAX_RETAIN_SEC = 3600;
  let bandwidthChart,
    bandwidthSamples = [],      // {t, label, rx, tx}; retained up to MAX_RETAIN
    bandwidthIface = '',
    bandwidthWindowSec = 120,   // selected DISPLAY window (default: 2 minutes)
    bandwidthinterval,
    bandwidthajax;

  function bandwidthCanvas(data) {
    let bandwidth = $('#bandwidth').get(0);
    if (!bandwidth) return;
    bandwidthChart = new Chart(bandwidth.getContext('2d'), {
      type: 'line',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, min: 0, title: { display: true, text: 'Mbps' } } },
        plugins: { legend: { display: true } }
      }
    });
  }

  // Show only the samples inside the selected window; the rest stay buffered for
  // when a longer window is picked. Creates the chart on first render.
  function renderBandwidth(now) {
    let cutoff = now - bandwidthWindowSec * 1000,
      view = bandwidthSamples.filter((s) => s.t >= cutoff),
      labels = view.map((s) => s.label),
      rx = view.map((s) => s.rx),
      tx = view.map((s) => s.tx);
    if (!bandwidthChart) {
      bandwidthCanvas({
        labels: labels,
        datasets: [
          { label: bandwidthIface + ' RX (Mbps)', data: rx, fill: false, borderColor: '#3c8dbc', tension: 0.3 },
          { label: bandwidthIface + ' TX (Mbps)', data: tx, fill: false, borderColor: '#00a65a', tension: 0.3 }
        ]
      });
    } else {
      bandwidthChart.data.labels = labels;
      bandwidthChart.data.datasets[0].data = rx;
      bandwidthChart.data.datasets[1].data = tx;
      bandwidthChart.update('none');
    }
  }

  function updateBandwidth() {
    function fetchData() {
      bandwidthajax = $.ajax({
        url: '/bandwidth',
        type: 'get',
        dataType: 'json',
        success: function(series) {
          if (!series || !series.netstats || !series.netstats[0]) return;
          // rx_sec/tx_sec are bytes/sec -> Mbps (bits/sec / 1e6), kept to 2dp so
          // sub-Mbps idle traffic is visible instead of rounding to a flat 0.
          // (si's first sample can be -1; treat anything not > 0 as 0.)
          let stat = series.netstats[0],
            toMbps = function(bps) { return (typeof bps === 'number' && bps > 0) ? Math.round((bps * 8 / 1e6) * 100) / 100 : 0; },
            now = Date.now();
          bandwidthIface = stat.iface;
          bandwidthSamples.push({ t: now, label: new Date(now).toLocaleTimeString(), rx: toMbps(stat.rx_sec), tx: toMbps(stat.tx_sec) });
          // Trim the buffer to the largest window so memory stays bounded.
          let retainCutoff = now - BANDWIDTH_MAX_RETAIN_SEC * 1000;
          while (bandwidthSamples.length && bandwidthSamples[0].t < retainCutoff) {
            bandwidthSamples.shift();
          }
          renderBandwidth(now);
        },
        complete: function() {
          bandwidthinterval = setTimeout(fetchData, 2000);
        }
      });
    }
    fetchData();
  }

  // Time-range buttons: change the DISPLAY window and re-slice the retained
  // buffer immediately, so a longer range shows existing history with no wait
  // and no data loss when growing the window.
  $('.bwTimeFilters').on('click', function(e) {
    e.preventDefault();
    $('.bwTimeFilters.active').removeClass('active');
    $(this).addClass('active');
    bandwidthWindowSec = Number($(this).attr('seconds')) || bandwidthWindowSec;
    if (bandwidthChart) renderBandwidth(Date.now());
  });

  if ($('#bandwidth').length) {
    let activeWindow = Number($('.bwTimeFilters.active').attr('seconds'));
    if (activeWindow) bandwidthWindowSec = activeWindow;
    updateBandwidth();
  }
})(jQuery);
