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
  let taskHistoryChart = undefined;
  function respondCanvas() {
    // Call a function to redraw other content (texts, images, etc)
    if (typeof taskHistoryChart === 'undefined') {
      var c = $('#taskHistory');
      var ctx = c.get(0).getContext('2d');
      var ctxOpts = {
        type: 'line',
        data: chartData,
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
      var container = c.parent();

      var $container = $(container);
      c.attr('width', $container.width());
      c.attr('height', $container.height());
      taskHistoryChart = new Chart(ctx, ctxOpts);
    } else {
      taskHistoryChart.data = chartData;
      taskHistoryChart.update(0);
    }

    setTimeout(updateHistory, 3000);
  }
  function updateHistory() {
    $.ajax({
      url: '/task-history',
      type: 'get',
      dataType: 'json',
      success: function(data) {
        chartData = {
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

        respondCanvas();
      }
    });
  };
  updateHistory();

})(jQuery);
