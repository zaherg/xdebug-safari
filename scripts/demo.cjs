const http = require('node:http');

const names = ['XDEBUG_SESSION', 'XDEBUG_PROFILE', 'XDEBUG_TRACE'];
const escapeHtml = value => value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function createDemoServer() {
    return http.createServer((request, response) => {
        const cookies = {};
        for (const pair of (request.headers.cookie || '').split(';')) {
            const index = pair.indexOf('=');
            const name = pair.slice(0, index).trim();
            if (!names.includes(name)) continue;
            try { cookies[name] = decodeURIComponent(pair.slice(index + 1)); }
            catch { cookies[name] = '(invalid encoding)'; }
        }
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Xdebug cookie check</title>
<style>body{font:16px/1.6 system-ui;margin:48px auto;padding:0 24px;max-width:640px;color-scheme:light dark}pre{overflow-wrap:anywhere;white-space:pre-wrap}a{color:LinkText}</style>
<h1>Xdebug cookie check</h1><p>Select a mode in the Safari extension, then <a href="/">reload this page</a>.</p>
<p>These are the Xdebug cookies received by this local server on the latest request:</p>
<pre id="cookies">${escapeHtml(JSON.stringify(cookies, null, 2))}</pre>
<p>This checks cookie delivery, not a PHP debugging session. To test breakpoints, use your PHP application with Xdebug enabled and your IDE listening.</p></html>`);
    });
}

if (require.main === module) {
    const server = createDemoServer();
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(8765, '127.0.0.1', () => console.log('Cookie check: http://127.0.0.1:8765 — Ctrl+C to stop'));
}

module.exports = { createDemoServer };
