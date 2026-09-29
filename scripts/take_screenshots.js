/* Screenshot the running app at mobile + desktop widths using system Chromium. */
const puppeteer = require('puppeteer-core');

const BASE = 'http://127.0.0.1:8810';
const TOKEN = require('fs').readFileSync('/tmp/shot_token', 'utf8').trim();

const VIEWS = [
  { name: 'mobile-360', width: 360, height: 740 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
];

const PAGES = [
  { path: '/dashboard', out: 'dashboard' },
  { path: '/rooms', out: 'rooms' },
  { path: '/sales', out: 'sales' },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((token) => {
    localStorage.setItem('invento_token', token);
  }, TOKEN);

  for (const v of VIEWS) {
    await page.setViewport({ width: v.width, height: v.height });
    for (const p of PAGES) {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 700));
      await page.screenshot({ path: `/tmp/shots/${p.out}-${v.name}.png`, fullPage: false });
      console.log(`shot: ${p.out}-${v.name}.png`);
    }
  }
  await browser.close();
})().catch((e) => {
  console.error('SCREENSHOTS FAILED:', e.message);
  process.exit(1);
});
