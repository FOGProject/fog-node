# fog-node
This is the FOG 2.0 parent repository.

Work in Progress

1. Install nodejs
2. Install mongo
 Recommend configuring user and password.
3. Download the repository using `git`
 `git clone https://github.com/fogproject/fog-node`
4. Change to the directory you just downloaded the repo to:
 `cd fog-node`
5. Install the modules needed
 `npm install`
6. Run the setup for fresh install:
 `node tools/setup/index.js`
6. Enter the information as required/requested.
7. Lift the server with `sails lift`
6. Enjoy.

TODO:
 Build views for all the different components
 Build systemctl script (linux)
 Build launchctl script (macos)
 Build Service/Task Scheduler to start script (windows)
 Test
 Testing again
