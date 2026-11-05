const figlet = require('figlet');
// chalk 5+ is ESM-only. Node 22 loads it with require(), and the chalk
// object is the module's default export.
const chalk = require('chalk').default;
const config = require('./config');

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
