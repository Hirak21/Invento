/* Debug why /rooms renders blank: capture console + page errors. */
const puppeteer = require('puppeteer-core');

const TOKEN = require('fs').readFileSync('/tmp/shot_token', 'utf8').trim();

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[console.${msg.type()}]`, msg.text().slice(0, 500));
    }
  });
  page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 800)));
  page.on('requestfailed', (req) => console.log('[requestfailed]', req.url(), req.failure()?.errorText));

  await page.evaluateOnNewDocument((token) => {
    localStorage.setItem('invento_token', token);
  }, TOKEN);

  await page.setViewport({ width: 360, height: 740 });
  await page.goto('http://127.0.0.1:8810/rooms', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  const text = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log('--- page text ---');
  console.log(text || '(EMPTY PAGE)');
  await browser.close();
})().catch((e) => {
  console.error('DEBUG FAILED:', e.message);
  process.exit(1);
});
