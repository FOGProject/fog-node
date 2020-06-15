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
})(jQuery);
