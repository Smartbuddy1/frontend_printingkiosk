const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const helpers = ['mobilePaymentBackendUrl', 'buildMobilePaymentUrl', 'parseHttpUrl', 'normalizeIndexPageUrl'].map(name => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const tail = source.slice(start);
  const end = tail.slice(1).search(/\n(?:async )?function /);
  assert.ok(end >= 0);
  return tail.slice(0, end + 1);
}).join('\n');

function browser(href, config = {}) {
  const context = vm.createContext({ URL, URLSearchParams, window: { location: new URL(href), PRINTING_KIOSK_CONFIG: config } });
  vm.runInContext(source.slice(0, source.indexOf('const RAZORPAY_CHECKOUT_URL')) + '\n' + helpers, context);
  return context;
}

test('QR on a local kiosk uses the configured public page API, preserving path and payment ID', () => {
  const ctx = browser('http://127.0.0.1:5082/?device=mini-pc', {
    backendUrl: 'http://127.0.0.1:5082', publicFrontendUrl: 'https://pay.example.test/printingkiosk'
  });
  const url = new URL(ctx.buildMobilePaymentUrl('', 'PAY-test'));
  assert.equal(url.pathname, '/printingkiosk/index.html');
  assert.equal(url.searchParams.get('mobilePayment'), 'PAY-test');
  assert.equal(url.searchParams.get('backendUrl'), 'https://pay.example.test');
  assert.equal(vm.runInContext('BACKEND_URL', ctx), 'http://127.0.0.1:5082');
});

test('already-issued phone links recover from loopback, private and mixed-content endpoints', () => {
  for (const backend of ['http://127.0.0.1:5082', 'http://localhost:5082', 'http://[::1]:5082', 'https://192.168.1.2', 'http://api.example.test']) {
    const ctx = browser('https://pay.example.test/printingkiosk/index.html?mobilePayment=PAY-test&backendUrl=' + encodeURIComponent(backend));
    assert.equal(vm.runInContext('BACKEND_URL', ctx), 'https://pay.example.test', backend);
  }
});

test('explicit public HTTPS API remains available for split hosting', () => {
  const ctx = browser('https://pay.example.test/?mobilePayment=PAY-test&backendUrl=https%3A%2F%2Fapi.example.test');
  assert.equal(vm.runInContext('BACKEND_URL', ctx), 'https://api.example.test');
  assert.equal(new URL(ctx.buildMobilePaymentUrl('', 'PAY-test')).searchParams.get('backendUrl'), 'https://api.example.test');
});

test('server-provided payment page takes priority over the local kiosk page', () => {
  const ctx = browser('http://127.0.0.1:5082/?device=mini-pc');
  const url = new URL(ctx.buildMobilePaymentUrl('https://pay.example.test/printingkiosk/index.html?mobilePayment=old', 'PAY-new'));
  assert.equal(url.origin, 'https://pay.example.test');
  assert.equal(url.searchParams.get('backendUrl'), url.origin);
  assert.equal(url.searchParams.get('mobilePayment'), 'PAY-new');
});

test('LAN and loopback demos retain their reachable endpoints', () => {
  for (const origin of ['http://192.168.1.10:15322', 'http://127.0.0.1:15320']) {
    const ctx = browser(origin + '/?mobilePayment=PAY-test');
    assert.equal(vm.runInContext('BACKEND_URL', ctx), origin);
  }
});
