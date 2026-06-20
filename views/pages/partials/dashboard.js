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
    activeUsageCanvas = $('#activityUsage').get(0);
  if (activeUsageCanvas) {
    new Chart(activeUsageCanvas.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: [
          `Available: ${qavail}`,
          `Active: ${qactive}`,
          `Staged: ${qstaged}`
        ],
        datasets: [{
          data: [qavail, qactive, qstaged],
          backgroundColor: ['#28a745', '#dc3545', '#007bff']
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
        scales: { y: { beginAtZero: true, min: 0, ticks: { precision: 0 } } }
      }
    });
  }

  function addBandwidthData(chart, label, value) {
    chart.data.labels.push(label);
    chart.data.datasets.forEach((dataset) => dataset.data.push(value));
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
          let label = new Date().toLocaleTimeString(),
            rate = Math.round(series.netstats[0].tx_sec / 1024 / 1024 * 8);
          if (!bandwidthChart) {
            bandwidthChartData = {
              labels: [label],
              datasets: [{ label: series.netstats[0].iface + ' Mbps', data: [rate], fill: false }]
            };
            bandwidthCanvas();
          } else {
            addBandwidthData(bandwidthChart, label, rate);
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
