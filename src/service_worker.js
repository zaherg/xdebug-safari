const ICONS = {
    0: { title: 'Disabled', image: 'img/disable32.png' },
    1: { title: 'Debugging', image: 'img/debug32.png' },
    2: { title: 'Profiling', image: 'img/profile32.png' },
    3: { title: 'Tracing', image: 'img/trace32.png' }
};

const updateIcon = async (status, tabId) => {
    const icon = ICONS[status] || ICONS[0];
    // A toolbar rendering failure must not turn a successful cookie write into a failure.
    try {
        await Promise.all([
            chrome.action.setTitle({ tabId, title: icon.title }),
            chrome.action.setIcon({ tabId, path: icon.image })
        ]);
    } catch (error) {
        console.warn('Could not update the toolbar icon:', error);
    }
};

const setTabStatus = async (tabId, status) => {
    if (!Number.isInteger(tabId) || tabId < 0 || !Number.isInteger(status) || !ICONS[status]) {
        throw new Error('Invalid tab or debugging mode. Reopen the popup and try again.');
    }
    const tab = await chrome.tabs.get(tabId);
    if (!/^https?:\/\//.test(tab.url || '')) {
        throw new Error('Open an HTTP or HTTPS website and allow this extension access in Safari.');
    }
    const response = await chrome.tabs.sendMessage(tabId, { cmd: 'setStatus', status });
    if (response?.error) throw new Error(response.error);
    if (response?.status !== status) throw new Error('The website did not confirm the change. Reload it and try again.');
    await updateIcon(response.status, tabId);
    return { ok: true, status: response.status };
};

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') return;
    try {
        const response = await chrome.tabs.sendMessage(tabId, { cmd: 'getStatus' });
        await updateIcon(response?.status, tabId);
    } catch {
        // Internal pages and websites without permission have no content script.
        await updateIcon(0, tabId);
    }
});

chrome.commands.onCommand.addListener(async command => {
    const desired = { 'run-toggle-debug': 1, 'run-toggle-profile': 2, 'run-toggle-trace': 3 }[command];
    if (!desired) return;
    try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab) return;
        const response = await chrome.tabs.sendMessage(tab.id, { cmd: 'getStatus' });
        if (response?.error) throw new Error(response.error);
        await setTabStatus(tab.id, response?.status === desired ? 0 : desired);
    } catch (error) {
        console.warn('Could not toggle Xdebug. Check website access and cookies:', error);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.cmd !== 'setStatus') return;
    // Keep the callback channel alive on Safari as well as Chromium.
    // Only our popup may select a tab; page content scripts cannot control other tabs.
    if (sender.id !== chrome.runtime.id || sender.tab || sender.url !== chrome.runtime.getURL('popup.html')) {
        sendResponse({ ok: false, error: 'This action must come from the extension popup.' });
        return true;
    }
    setTabStatus(request.tabId, request.status).then(sendResponse).catch(error => {
        sendResponse({
            ok: false,
            error: `${error.message} Check this extension’s website access in Safari, then reload the page.`
        });
    });
    return true;
});
