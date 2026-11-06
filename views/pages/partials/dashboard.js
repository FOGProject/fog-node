(function($) {
  // The FOG 1.6 dashboard charts (fog.dashboard.js at 98ac5bb732eb).
  //
  // Colors come from the --fog-chart-* tokens in assets/styles/zz-fog-ui.css,
  // so this script holds no color literal. On fog:themechange (fog.theme.js)
  // recolor() reads the tokens again and sets each chart's color options in
  // place. 1.6 destroys and rebuilds each chart instead (fog.dashboard.js:
  // 606-614); the result looks the same, and the bandwidth samples survive
  // either way.

  // No animation, as in 1.6 (fog.dashboard.js:25).
  Chart.defaults.animation.duration = 0;

  function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Every chart, with the color tokens of its first dataset, for recolor().
  let painted = [];

  // Sets the tick, grid and legend colors from the tokens. A doughnut has no
  // scales; a line chart has x and y.
  function setChrome(options) {
    let text = token('--fog-chart-text');
    let grid = token('--fog-chart-grid');
    options.plugins.legend.labels.color = token('--fog-chart-legend');
    $.each(options.scales || {}, (id, scale) => {
      scale.ticks.color = text;
      scale.grid.color = grid;
    });
  }

  // Sets the first dataset's colors from the tokens: one per slice on a
  // doughnut. A line chart has one color, so it takes names[0] only.
  function setColors(type, data, names) {
    let dataset = data.datasets[0];
    if (type === 'line') {
      dataset.borderColor = dataset.backgroundColor = token(names[0]);
    } else {
      dataset.backgroundColor = names.map(token);
    }
  }

  // Builds a chart with its colors from the tokens, and keeps it for recolor().
  function makeChart(canvas, type, data, options, names) {
    setChrome(options);
    setColors(type, data, names);
    let chart = new Chart(canvas.getContext('2d'), {type, data, options});
    painted.push({chart, names});
    return chart;
  }

  // A Chart.js 4 options change takes effect at update(), which resolves the
  // options again.
  function recolor() {
    painted.forEach((p) => {
      setChrome(p.chart.options);
      setColors(p.chart.config.type, p.chart.data, p.names);
      p.chart.update('none');
    });
  }
  document.addEventListener('fog:themechange', recolor);

  // Percentage helper for doughnut tooltips (Chart.js v4).
  function pctLabel(context) {
    let val = Number(context.parsed) || 0;
    let total = context.dataset.data.reduce((a, b) => a + Number(b), 0);
    let pct = total ? (val / total * 100).toFixed(1) : 0;
    return ` ${context.label}: ${pct}%`;
  }

  function doughnutOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: {} },
        tooltip: { callbacks: { label: pctLabel } }
      }
    };
  }

  // Storage Group Activity: the 1.6 labels and blues (fog.dashboard.js:231).
  let qavail = Number($('#avail').val()) || 0;
  let qactive = Number($('#active').val()) || 0;
  let qstaged = Number($('#staged').val()) || 0;
  let activeUsageCanvas = $('#activityUsage').get(0);
  if (activeUsageCanvas) {
    // Empty state: a 0/0/0 doughnut renders blank, so when there's no capacity
    // and no tasks show a single muted "No activity" ring instead of nothing.
    if (qavail + qactive + qstaged > 0) {
      makeChart(activeUsageCanvas, 'doughnut', {
        labels: ['Free', 'Queued', 'Active'],
        datasets: [{ data: [qavail, qstaged, qactive] }]
      }, doughnutOptions(), ['--fog-chart-free', '--fog-chart-queued', '--fog-chart-active']);
    } else {
      makeChart(activeUsageCanvas, 'doughnut', {
        labels: ['No activity'],
        datasets: [{ data: [1] }]
      }, doughnutOptions(), ['--fog-chart-empty']);
    }
  }

  // Storage Node Disk Usage (fog.dashboard.js:320).
  let free = Number($('#free').val()) || 0;
  let used = Number($('#used').val()) || 0;
  let total = free + used;
  let freePct = total ? (free / total * 100).toFixed(1) : 0;
  let usedPct = total ? (used / total * 100).toFixed(1) : 0;
  let diskUsageCanvas = $('#diskUsage').get(0);
  if (diskUsageCanvas) {
    makeChart(diskUsageCanvas, 'doughnut', {
      labels: [
        `Free: ${$.readableBytes(free)} (${freePct}%)`,
        `Used: ${$.readableBytes(used)} (${usedPct}%)`
      ],
      datasets: [{ data: [free, used] }]
    }, doughnutOptions(), ['--fog-chart-free', '--fog-chart-queued']);
  }

  // Imaging Over the last (fog.dashboard.js:471). A category x axis, so no
  // time adapter is needed.
  let taskHistoryChart;
  let taskHistoryTimeout;

  function historyCanvas(labels, data) {
    let history = $('#taskHistory').get(0);
    if (!history) return;
    if (!taskHistoryChart) {
      taskHistoryChart = makeChart(history, 'line', {
        labels,
        datasets: [{ label: 'Computers Imaged', data, fill: false }]
      }, {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: {}, grid: {} },
          y: { beginAtZero: true, min: 0, ticks: { precision: 0 }, grid: {} }
        },
        plugins: { legend: { display: false, labels: {} } }
      }, ['--fog-chart-queued']);
    } else {
      taskHistoryChart.data.labels = labels;
      taskHistoryChart.data.datasets[0].data = data;
      taskHistoryChart.update('none');
    }
  }

  function updateHistory() {
    let period = Number($('.graph-days.active').attr('rel')) || 30;
    $.ajax({
      url: '/task-history',
      type: 'post',
      data: { period },
      dataType: 'json',
      success: function(data) {
        historyCanvas(data.dates, data.data);
      }
    });
    taskHistoryTimeout = setTimeout(updateHistory, 3000);
  }

  $('.graph-days').on('click', function(e) {
    e.preventDefault();
    $('.graph-days.active').removeClass('active');
    $(this).addClass('active');
    if (taskHistoryTimeout) clearTimeout(taskHistoryTimeout);
    updateHistory();
  });

  if ($('#taskHistory').length) updateHistory();

  // Bandwidth (fog.dashboard.js:540-720). The poll runs every 2.5 s and keeps
  // up to an hour of samples, whatever window shows. The window links only
  // narrow the view, so a longer window shows the kept history at once.
  // Real Time Off stops the redraw only: the poll goes on and keeps its data,
  // and On redraws at once with it (fog.dashboard.js:639). One direction shows
  // at a time; Transmit is the default.
  const BANDWIDTH_POLL_MS = 2500;
  const BANDWIDTH_MAX_RETAIN_SEC = 3600;
  let bandwidthChart;
  let bandwidthSamples = [];      // {t, label, rx, tx}; kept up to MAX_RETAIN
  let bandwidthIface = '';
  let bandwidthWindowSec = Number($('.time-filters.active').attr('rel')) || 120;
  let realtime = true;

  function mbps(v) {
    return Number(v).toFixed(2) + ' Mbps';
  }

  // The plotted direction: the key of the active Transmit/Receive link.
  function direction() {
    return $('#graph-bandwidth-filters-transmit').hasClass('active') ? 'tx' : 'rx';
  }

  // Shows only the samples inside the selected window, in the selected
  // direction. Creates the chart on the first render.
  function renderBandwidth() {
    let canvas = $('#bandwidth').get(0);
    if (!canvas) return;
    let cutoff = Date.now() - bandwidthWindowSec * 1000;
    let view = bandwidthSamples.filter((s) => s.t >= cutoff);
    let labels = view.map((s) => s.label);
    let key = direction();
    let data = view.map((s) => s[key]);
    if (!bandwidthChart) {
      bandwidthChart = makeChart(canvas, 'line', {
        labels,
        datasets: [{ label: bandwidthIface, data, fill: false, pointRadius: 0, tension: 0.2 }]
      }, {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: {}, grid: { display: false } },
          y: { beginAtZero: true, min: 0, ticks: { callback: mbps }, grid: {} }
        },
        plugins: {
          legend: { position: 'top', labels: {} },
          tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + mbps(c.parsed.y) } }
        }
      }, ['--fog-chart-queued']);
    } else {
      bandwidthChart.data.labels = labels;
      bandwidthChart.data.datasets[0].label = bandwidthIface;
      bandwidthChart.data.datasets[0].data = data;
      bandwidthChart.update('none');
    }
  }

  function fetchBandwidth() {
    $.ajax({
      url: '/bandwidth',
      type: 'get',
      dataType: 'json',
      success: function(series) {
        if (!series || !series.netstats || !series.netstats[0]) return;
        // rx_sec/tx_sec are bytes/sec -> Mbps (bits/sec / 1e6), kept to 2dp so
        // sub-Mbps idle traffic is visible instead of rounding to a flat 0.
        // (si's first sample can be -1; treat anything not > 0 as 0.)
        let stat = series.netstats[0];
        let toMbps = function(bps) { return (typeof bps === 'number' && bps > 0) ? Math.round((bps * 8 / 1e6) * 100) / 100 : 0; };
        let now = Date.now();
        bandwidthIface = stat.iface;
        bandwidthSamples.push({ t: now, label: new Date(now).toLocaleTimeString(), rx: toMbps(stat.rx_sec), tx: toMbps(stat.tx_sec) });
        // Trim the buffer to the largest window so memory stays bounded.
        let retainCutoff = now - BANDWIDTH_MAX_RETAIN_SEC * 1000;
        while (bandwidthSamples.length && bandwidthSamples[0].t < retainCutoff) {
          bandwidthSamples.shift();
        }
        if (realtime) renderBandwidth();
      },
      complete: function() {
        setTimeout(fetchBandwidth, BANDWIDTH_POLL_MS);
      }
    });
  }

  $('#realtime .btn').on('click', function() {
    realtime = $(this).data('toggle') === 'on';
    $('#btn-on').toggleClass('active', realtime);
    $('#btn-off').toggleClass('active', !realtime);
    if (realtime) renderBandwidth();
  });

  $('.type-filters').on('click', function(e) {
    e.preventDefault();
    $('#graph-bandwidth-title > span').text($(this).text());
    $(this).addClass('active').siblings('a').removeClass('active');
    renderBandwidth();
  });

  $('.time-filters').on('click', function(e) {
    e.preventDefault();
    $('#graph-bandwidth-time-title > span').text($(this).text());
    $(this).addClass('active').siblings('a').removeClass('active');
    bandwidthWindowSec = Number($(this).attr('rel')) || bandwidthWindowSec;
    renderBandwidth();
  });

  if ($('#bandwidth').length) fetchBandwidth();
})(jQuery);
