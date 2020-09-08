const moment = require('moment');
module.exports = {
  friendlyName: 'Task history',
  description: 'Returns task history',
  inputs: {
    period: {
      friendlyName: 'Date Period to get.',
      description: 'A reference to the period to get data for.',
      type: 'number'
    }
  },
  fn: async function (inputs) {
    let data = [],
      dates = [],
      dateStart = await moment().subtract(inputs.period, 'days'),
      dateEnd = await moment();

    while (dateEnd.diff(dateStart, 'days') >= 0) {
      let begin = await moment(dateStart.format('YYYY-MM-DD')).toISOString(),
        end = await moment(dateStart.format('YYYY-MM-DD')).add(1, 'day').toISOString(),
        taskQuery = {
          startTime: {
            '>=': begin,
            '<': end
          },
          state: {
            '<': 5
          }
        };
      dates.push(dateStart.format('MM/DD/YYYY'));
      data.push(parseInt(await Task.count(taskQuery), 10));
      dateStart.add(1, 'day');
    }
    return {dates,data};
  }
};
