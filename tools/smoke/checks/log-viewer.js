/**
 * log-viewer: the FOG 1.6 Log Viewer page (GET /logviewer, issue #209).
 *
 * It proves, in a browser: the page loads, the File select lists fog-node.log
 * and the <pre> fills with the real log lines (the run's own log file); a
 * tail answer with a log line of `<img src=x onerror=alert(1)>` (served by
 * page.route()) shows as text, with no child element in the <pre> and no
 * dialog; the poll sends a request every 10 s (a fake clock), Pause Reload
 * stops the requests and Resume Reload sends one at once and starts the poll
 * again; and the Reverse order checkbox is sent in the body.
 * tools/smoke/ui.js runs this file (see the comment at its top).
 *
 * It uses a context of its own with a fake clock, so the clock does not stay
 * on for the later checks.
 */

const expect = (what, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what} is ${a}, expected ${e}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits (in real time) until `fn()` is true. The fake clock moves the page's
// timers only, so this wait is not affected by it.
async function until(what, fn) {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const TAIL = '**/api/v1/log/tail';
const EVIL = '<img src=x onerror=alert(1)>';
const PRE = '#logviewer-pre';

module.exports = {
  name: 'log-viewer: the Log Viewer page',
  run: async ({browser, base, login}) => {
    const context = await browser.newContext();
    const errors = [];
    try {
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      const dialogs = [];
      page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
      await page.clock.install();
      await login(page);

      // The real answer: the run's own log file has lines already.
      await page.goto(`${base}/logviewer`, {waitUntil: 'networkidle'});
      expect('the File select', await page.locator('#logviewer-file option').allInnerTexts(), ['fog-node.log']);
      await page.waitForFunction((sel) => document.querySelector(sel).textContent.trim() !== '', PRE, {timeout: 10000});

      // A served answer with a hostile line.
      const bodies = [];
      await page.route(TAIL, (route) => {
        bodies.push(route.request().postDataJSON());
        return route.fulfill({json: {file: 'fog-node.log', lines: [EVIL, 'line two']}});
      });
      await page.selectOption('#logviewer-lines', '10');
      await page.waitForFunction((sel) => document.querySelector(sel).textContent.includes('line two'), PRE, {timeout: 10000});
      expect('the <pre> text', await page.locator(PRE).textContent(), `${EVIL}\nline two`);
      expect('the child elements of the <pre>', await page.locator(PRE).evaluate((el) => el.childElementCount), 0);
      expect('the body of the request', bodies[bodies.length - 1], {file: 'fog-node.log', lines: 10, reverse: false});
      let count = bodies.length;
      await page.check('#logviewer-reverse');
      await until('the request of the Reverse change', () => bodies.length === count + 1);
      expect('the reverse flag', bodies[bodies.length - 1].reverse, true);

      // The 10-second poll.
      count = bodies.length;
      await page.clock.runFor(10000);
      await until('the poll request', () => bodies.length === count + 1);
      await sleep(300);
      expect('the requests after 10 s', bodies.length, count + 1);

      // Pause stops the requests.
      await page.click('#logviewer-pause');
      expect('the Pause button text', (await page.locator('#logviewer-pause').textContent()).trim(), 'Resume Reload');
      count = bodies.length;
      await page.clock.runFor(35000);
      await sleep(300);
      expect('the requests while paused', bodies.length, count);

      // Resume sends one at once, and the poll starts again.
      await page.click('#logviewer-pause');
      expect('the Resume button text', (await page.locator('#logviewer-pause').textContent()).trim(), 'Pause Reload');
      await until('the request of Resume', () => bodies.length === count + 1);
      await page.clock.runFor(10000);
      await until('the poll request after Resume', () => bodies.length === count + 2);
      await sleep(300);
      expect('the requests 10 s after Resume', bodies.length, count + 2);

      expect('the dialogs', dialogs, []);
      if (errors.length) throw new Error(`the page threw: ${errors[0]}`);
    } finally {
      await context.close();
    }
  }
};
