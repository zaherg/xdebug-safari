// Real DOM/cookies/HTTP with a WebExtension API bridge. This is not a Safari runtime test.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');
const { createDemoServer } = require('../scripts/demo.cjs');

(async () => {
    const root = path.resolve(__dirname, '..');
    const output = path.join(root, 'build', 'verification');
    await fs.mkdir(output, { recursive: true });
    const profile = await fs.mkdtemp(path.join(output, 'chrome-'));
    const server = createDemoServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/`;
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            userDataDir: profile,
            headless: true,
            args: ['--no-first-run'],
        });
        const errors = [];
        const settings = {};
        let denied = false;
        let activeUrl = url;
        let backgroundListener;
        const manifest = JSON.parse(await fs.readFile(path.join(root, 'src/manifest.json')));
        const locales = JSON.parse(await fs.readFile(path.join(root, 'src/_locales/en/messages.json')));
        const event = { addListener() {} };
        const site = await browser.newPage();
        const sendToSite = async message => {
            if (denied) throw new Error('Website permission denied');
            return site.evaluate(message => new Promise(resolve => window.contentListener(message, {}, resolve)), message);
        };
        const chrome = {
            tabs: {
                query: async () => [{ id: 7, url: activeUrl }],
                get: async () => ({ id: 7, url: activeUrl }),
                sendMessage: (_, message) => sendToSite(message),
                onUpdated: event,
            },
            runtime: {
                id: 'test', getURL: file => `safari-web-extension://test/${file}`,
                onMessage: { addListener: listener => { backgroundListener = listener; } },
            },
            action: { setIcon: async () => {}, setTitle: async () => {} },
            commands: { onCommand: event },
        };
        vm.runInNewContext(await fs.readFile(path.join(root, 'src/service_worker.js'), 'utf8'), { chrome, console });

        async function bridge(page) {
            page.setDefaultTimeout(10000);
            page.on('pageerror', error => errors.push(error.message));
            await page.exposeFunction('__getSettings', defaults => ({ ...defaults, ...settings }));
            await page.exposeFunction('__saveSettings', values => { Object.assign(settings, values); });
            await page.exposeFunction('__getTab', () => [{ id: 7, url: activeUrl }]);
            await page.exposeFunction('__sendToSite', sendToSite);
            await page.exposeFunction('__sendToBackground', message => new Promise(resolve => {
                backgroundListener(message, { id: 'test', url: 'safari-web-extension://test/popup.html' }, resolve);
            }));
            await page.evaluateOnNewDocument((manifest, locales) => {
                window.chrome = {
                    i18n: { getMessage: name => locales[name]?.message || name },
                    runtime: {
                        getManifest: () => manifest,
                        onMessage: { addListener: listener => { window.contentListener = listener; } },
                        sendMessage: message => window.__sendToBackground(message),
                        openOptionsPage: async () => { window.optionsOpened = true; },
                    },
                    storage: { local: {
                        get: (defaults, callback) => {
                            const result = window.__getSettings(defaults);
                            if (callback) { result.then(callback); return; }
                            return result;
                        },
                        set: settings => window.__saveSettings(settings),
                    } },
                    tabs: {
                        query: () => window.__getTab(),
                        sendMessage: (_, message) => window.__sendToSite(message),
                    },
                    commands: { getAll: async () => [] },
                };
                window.close = () => { window.popupClosed = true; };
            }, manifest, locales);
        }
        await bridge(site);
        const loadSite = async () => {
            await site.bringToFront();
            await site.goto(url);
            await site.addScriptTag({ path: path.join(root, 'src/content.js') });
        };
        await loadSite();
        const popup = await browser.newPage();
        await bridge(popup);
        await popup.setViewport({ width: 284, height: 340 });
        const popupUrl = pathToFileURL(path.join(root, 'src/popup.html')).href;
        const loadPopup = async () => {
            await popup.bringToFront();
            await popup.goto(popupUrl);
            await popup.waitForFunction(() => !document.querySelector('#status').textContent.includes('Checking'));
        };
        await loadPopup();
        assert.equal(await popup.$eval('#disable', input => input.checked), true);
        await popup.keyboard.press('Tab');
        assert.equal(await popup.evaluate(() => document.activeElement.id), 'disable');
        await popup.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
        await popup.waitForFunction(() => getComputedStyle(document.querySelector('label[for="debug"]')).backgroundColor === 'rgb(204, 204, 204)');
        await popup.screenshot({ path: path.join(output, 'popup-light.png') });
        await popup.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
        await popup.waitForFunction(() => getComputedStyle(document.querySelector('label[for="debug"]')).backgroundColor === 'rgb(68, 68, 68)');
        await popup.screenshot({ path: path.join(output, 'popup-dark.png') });

        for (const [mode, cookie] of [['debug', 'XDEBUG_SESSION'], ['profile', 'XDEBUG_PROFILE'], ['trace', 'XDEBUG_TRACE'], ['disable', null]]) {
            await loadPopup();
            await popup.click(`label[for="${mode}"]`);
            await popup.waitForFunction(() => window.popupClosed === true);
            await loadSite();
            const received = JSON.parse(await site.$eval('#cookies', element => element.textContent));
            assert.deepEqual(received, cookie ? { [cookie]: '' } : {});
            await loadPopup();
            assert.equal(await popup.$eval(`#${mode}`, input => input.checked), true);
        }
        console.log('PASS: popup → background → content script → real cookies → HTTP server, all four modes');

        const options = await browser.newPage();
        await bridge(options);
        await options.goto(pathToFileURL(path.join(root, 'src/options.html')).href);
        await options.waitForFunction(() => !document.querySelector('fieldset').disabled);
        for (const id of ['debugtrigger', 'tracetrigger', 'profiletrigger']) {
            assert.equal(await options.$eval(`#${id}`, input => input.value), '');
            assert.equal(await options.$eval(`#${id}`, input => input.placeholder), '');
        }
        assert.deepEqual(settings, {}, 'Opening settings must not persist defaults');
        await options.$eval('#debugtrigger', input => { input.value = 'PHPSTORM'; });
        await options.click('button[type="submit"]');
        await options.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Saved.'));
        await options.reload();
        await options.waitForFunction(() => !document.querySelector('fieldset').disabled);
        assert.equal(await options.$eval('#debugtrigger', input => input.value), 'PHPSTORM');
        assert.equal(await options.$eval('#tracetrigger', input => input.value), '');
        assert.equal(await options.$eval('#profiletrigger', input => input.value), '');
        await options.screenshot({ path: path.join(output, 'settings.png'), fullPage: true });
        await options.setViewport({ width: 360, height: 740 });
        await options.screenshot({ path: path.join(output, 'settings-narrow.png'), fullPage: true });
        assert.equal(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await loadPopup();
        await popup.click('label[for="debug"]');
        await popup.waitForFunction(() => window.popupClosed === true);
        await loadSite();
        assert.deepEqual(JSON.parse(await site.$eval('#cookies', el => el.textContent)), { XDEBUG_SESSION: 'PHPSTORM' });
        console.log('PASS: saved custom trigger reaches the next HTTP request; settings fit narrow window');

        await loadPopup();
        denied = true;
        await popup.click('label[for="trace"]');
        await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('permission'));
        assert.equal(await popup.evaluate(() => !!window.popupClosed), false);
        assert.equal(await popup.$eval('#debug', input => input.checked), true);
        await popup.screenshot({ path: path.join(output, 'popup-error.png') });
        await loadPopup();
        assert.equal(await popup.$eval('#debug', input => input.disabled), true);
        await popup.click('#options');
        assert.equal(await popup.evaluate(() => window.optionsOpened), true);
        denied = false;
        activeUrl = 'about:blank';
        await loadPopup();
        assert.equal(await popup.$eval('#debug', input => input.disabled), true);
        console.log('PASS: blocked and internal pages disable toggles; settings remain accessible; failed changes stay open');
        assert.deepEqual(errors, []);
        console.log(`Screenshots: ${output}`);
    } finally {
        if (browser) await browser.close();
        server.close();
        await fs.rm(profile, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
