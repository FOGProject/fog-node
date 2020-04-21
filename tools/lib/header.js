const figlet = require('figlet'),
  chalk = require('chalk'),
  config = require('./config');

module.exports = {
  print: (message) => {
    console.log(
      chalk.cyan(
        figlet.textSync(`FOG ${config.package.version}`,{horizontalLayout: 'full'})
      )
    );
    console.log(
      chalk.yellow(message)
    );
  },
  printSection: (title) => {
    console.log(
      chalk.yellow(title)
    );
  }
};
