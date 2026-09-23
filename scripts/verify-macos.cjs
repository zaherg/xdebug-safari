const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const app = process.argv[2];
assert.ok(app, 'Usage: node scripts/verify-macos.cjs /path/to/App.app');
const extension = path.join(app, 'Contents/PlugIns/Xdebug Helper for Safari Extension.appex');
const resources = path.join(extension, 'Contents/Resources');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json')));
const readPlist = file => JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]));
const appInfo = readPlist(path.join(app, 'Contents/Info.plist'));
const extensionInfo = readPlist(path.join(extension, 'Contents/Info.plist'));

assert.equal(appInfo.CFBundleIdentifier, 'dev.zaher.XdebugHelper');
assert.equal(extensionInfo.CFBundleIdentifier, `${appInfo.CFBundleIdentifier}.Extension`);
assert.equal(appInfo.CFBundleShortVersionString, manifest.version);
assert.equal(extensionInfo.CFBundleShortVersionString, manifest.version);
assert.equal(extensionInfo.NSExtension.NSExtensionPointIdentifier, 'com.apple.Safari.web-extension');
assert.ok(extensionInfo.NSExtension.NSExtensionPrincipalClass.endsWith('.SafariWebExtensionHandler'));

function verifyResources(relative = '') {
    for (const entry of fs.readdirSync(path.join(root, 'src', relative), { withFileTypes: true })) {
        const child = path.join(relative, entry.name);
        if (entry.isDirectory()) verifyResources(child);
        else assert.deepEqual(fs.readFileSync(path.join(resources, child)), fs.readFileSync(path.join(root, 'src', child)), `Stale/missing packaged resource: ${child}`);
    }
}
verifyResources();
assert.deepEqual(fs.readFileSync(path.join(app, 'Contents/Resources/LICENSE')), fs.readFileSync(path.join(root, 'LICENSE')));

for (const bundle of [app, extension]) {
    const signature = spawnSync('/usr/bin/codesign', ['-d', '--verbose=4', bundle], { encoding: 'utf8' });
    assert.equal(signature.status, 0, signature.stderr);
    assert.match(signature.stderr, /^Authority=Developer ID Application:/m, 'Developer ID signing is required');
    assert.match(signature.stderr, /^Timestamp=/m, 'Secure signing timestamp is required for notarization');
    assert.match(signature.stderr, /flags=.*\(runtime\)/, 'Hardened runtime must remain enabled');
    const entitlements = execFileSync('/usr/bin/codesign', ['-d', '--entitlements', '-', '--xml', bundle], { stdio: ['ignore', 'pipe', 'pipe'] });
    assert.ok(entitlements.length, `Missing signed entitlements: ${bundle}`);
    const parsed = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: entitlements }));
    assert.equal(parsed['com.apple.security.app-sandbox'], true, 'App sandbox must remain enabled');
    assert.notEqual(parsed['com.apple.security.get-task-allow'], true, 'Release build must not grant debugger attachment');
}
console.log('PASS: native bundle IDs, versions, sandboxing, license, and all packaged extension resources');
