(function($) {
  let free = $('#free').val(),
    used = $('#used').val(),
    hFree = $.readableBytes(free),
    hUsed = $.readableBytes(used);
  // Disk Usage
  let diskUsageCanvas = $('#diskUsage').get(0).getContext('2d'),
    diskUsageData = {
      labels: [
        `Free: ${hFree}`,
        `Used: ${hUsed}`
      ],
      datasets: [
        {
          data: [
            free,
            used
          ],
          backgroundColor: [
            '#28a745',
            '#dc3545',
            '#007bff'
          ]
        }
      ]
    },
    diskUsageOpts = {
      responsive: true,
      plugins: {
        labels: {
          render: 'percentage',
          precision: 0,
          fontColor: '#ffffff',
          fontSize: 12
        }
      },
      legend: {
        position: 'bottom'
      },
      tooltips: {
        callbacks: {
          label: function(tooltipItem, data) {
            var dataset = data.datasets[tooltipItem.datasetIndex];
            var meta = dataset._meta[Object.keys(dataset._meta)[0]];
            var total = meta.total;
            var currentValue = dataset.data[tooltipItem.index];
            var percentage = parseFloat((currentValue/total*100).toFixed(1));
            var hText = $.readableBytes(currentValue);
            return `${hText} (${percentage}%)`;
          },
        }
      }
    },
    diskUsageChart = new Chart(diskUsageCanvas, {
      type: 'doughnut',
      data: diskUsageData,
      options: diskUsageOpts
    });
  // Task History
  let taskHistoryChart = undefined,
    taskHistoryTimeout,
    tInterval = 30;

  function getTInterval() {
    let val = $('.taskDayFilters.active').attr('length');

    switch (val) {
      case '-1':
        updateHistory(365);
        break;
      case '2':
        updateHistory(60);
        break;
      case '3':
        updateHistory(90);
        break;
      case '6':
        updateHistory(183);
        break;
      default:
        updateHistory(30);
    }

    taskHistoryTimeout = setTimeout(getTInterval, 3000);
  }

  function historyCanvas() {
    // Call a function to redraw other content (texts, images, etc)
    if (typeof taskHistoryChart === 'undefined') {
      var history = $('#taskHistory');
      var htx = history.get(0).getContext('2d');
      var htxOpts = {
        type: 'line',
        data: taskChartData,
        options: {
          responsive: true,
          scales: {
            xAxes: [{
              type: 'time',
              time: {
                unit: 'day'
              }
            }],
            yAxes: [{
              ticks: {
                beginAtZero: true,
                min: 0,
                precision: 0
              }
            }]
          }
        }
      }
      var historyContainer = history.parent();

      var $historyContainer = $(historyContainer);
      history.attr('width', $historyContainer.width());
      history.attr('height', $historyContainer.height());
      taskHistoryChart = new Chart(htx, htxOpts);
    } else {
      taskHistoryChart.data = taskChartData;
      taskHistoryChart.update(0);
    }
  }

  function updateHistory(period) {
    $.ajax({
      url: '/task-history',
      type: 'post',
      data: {period},
      dataType: 'json',
      success: function(data) {
        taskChartData = {
          labels: data.dates,
          datasets: [
            {
              label: 'Tasks',
              data: data.data,
              fill: false
            }
          ]
        };

        max = Math.max.apply(Math, data.data);

        historyCanvas();
      }
    });
  };

  $('.taskDayFilters').on('click', function(e) {
    e.preventDefault();
    $('.taskDayFilters.active').removeClass('active');
    $(this).addClass('active');
    if (taskHistoryTimeout) {
      clearTimeout(taskHistoryTimeout);
    }
    getTInterval();
  });

  getTInterval();

  // Bandwidth
  let bandwidthChart,
    bandwidthinterval,
    bandwidthajax;
  function addBandwidthData(chart, label, data) {
    chart.data.labels.push(label);
    chart.data.datasets.forEach((dataset) => {
      dataset.data.push(data);
    });
    chart.update();
  }
  function remBandwidthData(chart) {
    chart.data.labels.pop();
    chart.data.datasets.forEach((dataset) => {
      dataset.data.pop();
    });
    chart.update();
  }
  function bandwidthCanvas() {
    var bandwidth = $('#bandwidth');
    var btx = bandwidth.get(0).getContext('2d');
    var btxOpts = {
      type: 'line',
      data: bandwidthChartData,
      options: {
        responsive: true,
        scales: {
          xAxes: [{
            type: 'time',
            time: {
              unit: 'second'
            }
          }],
          yAxes: [{
            ticks: {
              beginAtZero: true,
              min: 0,
              precision: 0
            }
          }]
        }
      }
    };
    var bandwidthContainer = bandwidth.parent();
    var $bandwidthContainer = $(bandwidthContainer);
    bandwidth.attr('width', $bandwidthContainer.width());
    bandwidth.attr('height', $bandwidthContainer.height());
    bandwidthChart = new Chart(btx, btxOpts);
  }
  function updateBandwidth() {

    // Fetches the data.
    function fetchData() {

      // When ajax receives data, this updates the graph.
      function onDataReceived(series) {

        // Setup our Time elements.
        var d = new Date(),
          n = d.getTime();

        let rate = Math.round(series.netstats[0].tx_sec / 1024 / 1024 * 8, 2);
        if (!bandwidthChart) {
          bandwidthChartData = {
            labels: [
              n
            ],
            datasets: [
              {
                label: series.netstats[0].iface + ' Mbps',
                data: [
                  0
                ],
                fill: false
              }
            ]
          }
          bandwidthCanvas();
        } else {
          addBandwidthData(bandwidthChart, n, rate);
        }
      }
      bandwidthajax = $.ajax({
        url: '/bandwidth',
        type: 'get',
        dataType: 'json',
        beforeSend: () => {
          if (bandwidthajax) {
            bandwidthajax.abort();
          }
          if (bandwidthinterval) {
            clearTimeout(bandwidthinterval);
          }
        },
        success: onDataReceived,
        complete: () => {}
      });

      bandwidthinterval = setTimeout(fetchData, 1000);
    }

    // Actually fetch our data.
    fetchData();
  }
  // If the user presses the off button, we should stop
  // displaying, notice we still collect data, we just don't
  // display it. When you press on again, it should update
  // with your missed data.
  $('#realtime .btn').on('click', (e) => {
    let selected = $(this).data('toggle');
    if (selected === 'on' && realtime === 'on') {
      return;
    } else if (selected) {
      realtime = 'on';
      $('#btn-off').removeClass('active');
      $('#btn-on').addClass('active');
    } else {
      realtime = 'off';
      $('#btn-off').addClass('active');
      $('#btn-on').removeClass('active');
    }
  });
  updateBandwidth();
})(jQuery);
