(function($) {
  // Disk Usage
  let diskUsageCanvas = $('#diskUsage').get(0).getContext('2d'),
    diskUsageData = {
      labels: [
        'Free',
        'Used',
        'Total'
      ],
      datasets: [
        {
          data: [
            $('#free').val(),
            $('#used').val()
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
      legend: {
        display: false
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
          }
        }
      }
    },
    diskUsageChart = new Chart(diskUsageCanvas, {
      type: 'doughnut',
      data: diskUsageData,
      options: diskUsageOpts
    });
})(jQuery);
