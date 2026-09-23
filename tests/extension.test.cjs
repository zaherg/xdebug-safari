const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(file, globals) {
    const context = vm.createContext({ console, ...globals });
    vm.runInContext(fs.readFileSync(`src/${file}`, 'utf8'), context);
    return context;
}

function background({ status = 0, denied = false } = {}) {
    const listeners = {};
    const messages = [];
    const titles = [];
    const event = name => ({ addListener: fn => { listeners[name] = fn; } });
    const chrome = {
        storage: { local: { get: (defaults, cb) => cb(defaults) } },
        tabs: {
            query: async () => [{ id: 99 }],
            get: async id => ({ id, url: 'https://app.test/' }),
            sendMessage: async (id, message) => {
                messages.push({ id, ...message });
                if (denied) throw new Error('Permission denied');
                return { status: message.cmd === 'setStatus' ? message.status : status };
            },
            onUpdated: event('updated'),
        },
        action: {
            setTitle: async info => titles.push(info),
            setIcon: async () => {},
        },
        commands: { onCommand: event('command'), getAll: cb => cb([]) },
        runtime: {
            id: 'test-extension', getURL: path => `safari-web-extension://test/${path}`,
            onMessage: event('message'), onInstalled: event('installed'),
            OnInstalledReason: { INSTALL: 'install' }, setUninstallURL: () => {},
        },
    };
    const context = load('service_worker.js', { chrome });
    return { context, listeners, messages, titles, chrome };
}

const popupSender = { id: 'test-extension', url: 'safari-web-extension://test/popup.html' };

function request(harness, message, sender = popupSender) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No message response')), 100);
        const keepAlive = harness.listeners.message(message, sender, result => {
            clearTimeout(timer);
            resolve(result);
        });
        if (keepAlive !== true) {
            clearTimeout(timer);
            reject(new Error('Listener must return true to retain the response channel'));
        }
    });
}

test('popup toggle targets the original tab and acknowledges completion', async () => {
    const h = background();
    const result = await request(h, { cmd: 'setStatus', tabId: 7, status: 1 });
    assert.equal(result.status, 1);
    assert.equal(result.ok, true);
    assert.equal(h.messages[0].id, 7);
    assert.equal(h.titles[0].tabId, 7);
});

test('denied site access produces an explicit failure', async () => {
    const result = await request(background({ denied: true }), { cmd: 'setStatus', tabId: 7, status: 1 });
    assert.equal(result.ok, false);
    assert.match(result.error, /access|permission/i);
});

test('invalid mode does not mutate cookies', async () => {
    const h = background();
    const result = await request(h, { cmd: 'setStatus', tabId: 7, status: 9 });
    assert.equal(result.ok, false);
    assert.equal(h.messages.length, 0);
});

test('content scripts cannot control another tab', async () => {
    const h = background();
    const result = await request(h, { cmd: 'setStatus', tabId: 7, status: 1 }, {
        id: 'test-extension', url: 'https://app.test/', tab: { id: 8 },
    });
    assert.equal(result.ok, false);
    assert.equal(h.messages.length, 0);
});

test('undefined icon status falls back to disabled', async () => {
    const h = background();
    await vm.runInContext('updateIcon(undefined, 7)', h.context);
    assert.equal(h.titles[0].title, 'Disabled');
});

for (const [command, status] of [['debug', 1], ['profile', 2], ['trace', 3]]) {
    test(`keyboard command toggles ${command} on and off`, async () => {
        for (const current of [0, status]) {
            const h = background({ status: current });
            await h.listeners.command(`run-toggle-${command}`);
            assert.equal(h.messages.at(-1).status, current === 0 ? status : 0);
        }
    });
}

function content({ cookies = '', blocked = false, hostname = 'localhost', settings = {} } = {}) {
    const jar = new Map(cookies.split('; ').filter(Boolean).map(pair => {
        const index = pair.indexOf('=');
        return [pair.slice(0, index), pair.slice(index + 1)];
    }));
    let listener;
    const document = {
        get cookie() { return [...jar].map(([key, value]) => `${key}=${value}`).join('; '); },
        set cookie(value) {
            if (blocked) return;
            const [pair] = value.split(';');
            const index = pair.indexOf('=');
            const key = pair.slice(0, index);
            const expires = /expires=([^;]+)/i.exec(value);
            if (expires && new Date(expires[1]) < new Date()) jar.delete(key);
            else jar.set(key, pair.slice(index + 1));
        },
    };
    const chrome = {
        storage: { local: { get: (defaults, cb) => cb({ ...defaults, ...settings }) } },
        runtime: { onMessage: { addListener: fn => { listener = fn; } } },
    };
    const context = load('content.js', { chrome, document, window: { location: { hostname } } });
    return { context, jar, request: message => new Promise(resolve => listener(message, {}, resolve)) };
}

test('malformed unrelated cookie value does not crash status detection', async () => {
    const h = content({ cookies: 'XDEBUG_SESSION=%E0%A4%A' });
    const result = await h.request({ cmd: 'getStatus' });
    assert.equal(result.status, 0);
});

test('cookie values containing an equals sign are read intact', () => {
    const h = content({ cookies: 'XDEBUG_SESSION=key=with=equals' });
    assert.equal(vm.runInContext('getCookie("XDEBUG_SESSION")', h.context), 'key=with=equals');
});

test('unset settings use empty triggers, mode transitions work, and Disable clears them', async () => {
    const h = content();
    assert.equal((await h.request({ cmd: 'getStatus' })).status, 0);
    for (const [status, name] of [[1, 'XDEBUG_SESSION'], [2, 'XDEBUG_PROFILE'], [3, 'XDEBUG_TRACE']]) {
        const result = await h.request({ cmd: 'setStatus', status });
        assert.equal(result.status, status);
        assert.deepEqual([...h.jar.keys()], [name]);
        assert.equal(h.jar.get(name), '');
        assert.equal((await h.request({ cmd: 'getStatus' })).status, status);
    }
    await h.request({ cmd: 'setStatus', status: 0 });
    assert.equal(h.jar.size, 0);
});

test('explicitly saved trigger values are preserved', async () => {
    const h = content({ settings: {
        xdebugDebugTrigger: 'my-ide',
        xdebugProfileTrigger: 'my-profile',
        xdebugTraceTrigger: 'my-trace'
    } });
    for (const [status, name, value] of [[1, 'XDEBUG_SESSION', 'my-ide'], [2, 'XDEBUG_PROFILE', 'my-profile'], [3, 'XDEBUG_TRACE', 'my-trace']]) {
        assert.equal((await h.request({ cmd: 'setStatus', status })).status, status);
        assert.equal(h.jar.get(name), value);
        assert.equal((await h.request({ cmd: 'getStatus' })).status, status);
    }
});

test('blocked cookies do not report a successful toggle', async () => {
    const result = await content({ blocked: true }).request({ cmd: 'setStatus', status: 1 });
    assert.match(result.error, /cookies/i);
    assert.notEqual(result.status, 1);
});
