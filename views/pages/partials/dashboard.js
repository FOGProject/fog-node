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

  // Bandwidth (category x-axis)
  let bandwidthChart,
    bandwidthChartData,
    bandwidthinterval,
    bandwidthajax;

  function bandwidthCanvas() {
    let bandwidth = $('#bandwidth').get(0);
    if (!bandwidth) return;
    bandwidthChart = new Chart(bandwidth.getContext('2d'), {
      type: 'line',
      data: bandwidthChartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, min: 0, title: { display: true, text: 'Mbps' } } },
        plugins: { legend: { display: true } }
      }
    });
  }

  function addBandwidthData(chart, label, values) {
    chart.data.labels.push(label);
    chart.data.datasets.forEach((dataset, i) => dataset.data.push(values[i]));
    if (chart.data.labels.length > 30) {
      chart.data.labels.shift();
      chart.data.datasets.forEach((dataset) => dataset.data.shift());
    }
    chart.update('none');
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
            label = new Date().toLocaleTimeString(),
            rx = toMbps(stat.rx_sec),
            tx = toMbps(stat.tx_sec);
          if (!bandwidthChart) {
            bandwidthChartData = {
              labels: [label],
              datasets: [
                { label: stat.iface + ' RX (Mbps)', data: [rx], fill: false, borderColor: '#3c8dbc', tension: 0.3 },
                { label: stat.iface + ' TX (Mbps)', data: [tx], fill: false, borderColor: '#00a65a', tension: 0.3 }
              ]
            };
            bandwidthCanvas();
          } else {
            addBandwidthData(bandwidthChart, label, [rx, tx]);
          }
        },
        complete: function() {
          bandwidthinterval = setTimeout(fetchData, 2000);
        }
      });
    }
    fetchData();
  }

  if ($('#bandwidth').length) updateBandwidth();
})(jQuery);
