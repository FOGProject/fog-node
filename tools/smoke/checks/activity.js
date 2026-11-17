/**
 * The Activity page (issue #206).
 *
 * It proves, in a browser, that GET /activity loads with the headings Who,
 * When, What and From; that the grid fills (the round trips that ui.js runs
 * before this file write successful host and image changes, and those are
 * Activity rows); and that a click on a row opens the "Activity entry" modal
 * with a Close button and no request. tools/smoke/ui.js runs this file (see
 * the comment at its top).
 */

const expect = (what, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what} is ${a}, expected ${e}`);
};

module.exports = {
  name: 'activity: the Activity page',
  run: async ({page, checkPage}) => {
    await checkPage(page, {path: '/activity', table: true});
    expect('the headings', (await page.locator('#listtable thead th').allInnerTexts()).map((t) => t.trim()), ['Who', 'When', 'What', 'From']);
    await page.locator('#listtable tbody tr:not(.dt-empty) td').first().waitFor({timeout: 10000});

    // A click on a row opens the modal, and the modal makes no request.
    const requests = [];
    const onRequest = (r) => requests.push(r.url());
    page.on('request', onRequest);
    try {
      await page.locator('#listtable tbody tr:not(.dt-empty)').first().locator('td').first().click();
      const modal = page.locator('.modal.show');
      await modal.locator('.modal-title').waitFor({timeout: 10000});
      expect('the modal title', (await modal.locator('.modal-title').innerText()).trim(), 'Activity entry');
      const labels = await modal.locator('dt').allInnerTexts();
      expect('the first modal labels', labels.slice(0, 4), ['Who', 'When', 'From', 'What']);
      expect('the modal buttons', await modal.locator('.modal-footer button').allInnerTexts(), ['Close']);
      await modal.locator('.modal-footer button').click();
      await page.locator('.modal.show').waitFor({state: 'detached', timeout: 10000});
    } finally {
      page.off('request', onRequest);
    }
    expect('the requests that the row click made', requests, []);
  }
};
