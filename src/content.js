const DEFAULT_TRIGGER_VALUE = '';

const getCookie = (name) => {
    const cookie = document.cookie.split(';').find((c) => c.trim().startsWith(`${name}=`));
    if (!cookie) return null;
    try {
        return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
    } catch {
        return null;
    }
};

const setCookie = (name, value, days = 365) => {
    const domain = getDomainForCookie();
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    let cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/`;
    if (domain) {
        cookie += `;domain=${domain}`;
    }
    document.cookie = cookie;
};

const getDomainForCookie = () => {
    const hostname = window.location.hostname;

    // IP addresses should use host-only cookies (no domain attribute)
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname)) {
        return null;
    }

    // localhost should also ideally be host-only as domain=localhost is often rejected
    if (hostname === 'localhost' || hostname.includes(':')) {
        return null;
    }

    const parts = hostname.split('.');

    // Start from the TLD-ish part (e.g. 'com' or 'localhost') and work up.
    // The probe logic will ensure we only use domains that the browser actually accepts.
    for (let i = parts.length - 1; i >= 0; i--) {
        const domain = parts.slice(i).join('.');

        if (parts.length > 1 && i === parts.length - 1 && domain !== 'localhost') {
            continue;
        }

        const value = Math.random().toString(36).substring(2);
        const name = `_xd_${value}`;
        document.cookie = `${name}=${value};domain=${domain};path=/`;

        if (document.cookie.includes(`${name}=${value}`)) {
            document.cookie = `${name}=;domain=${domain};path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT`;
            return domain;
        }
    }

    return null;
};

const getStatusMap = (settings) => {
    const { xdebugDebugTrigger, xdebugTraceTrigger, xdebugProfileTrigger } = settings;
    return {
        1: { name: 'XDEBUG_SESSION', trigger: xdebugDebugTrigger },
        2: { name: 'XDEBUG_PROFILE', trigger: xdebugProfileTrigger },
        3: { name: 'XDEBUG_TRACE', trigger: xdebugTraceTrigger },
    };
};

const getCurrentStatus = () => {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get({
            xdebugDebugTrigger: DEFAULT_TRIGGER_VALUE,
            xdebugTraceTrigger: DEFAULT_TRIGGER_VALUE,
            xdebugProfileTrigger: DEFAULT_TRIGGER_VALUE
        }, (settings) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            const statusMap = getStatusMap(settings);
            for (const [idx, { name, trigger }] of Object.entries(statusMap)) {
                if (getCookie(name) === trigger) {
                    resolve(+idx);
                    return;
                }
            }

            resolve(0);
        });
    });
};

const setStatus = status => {
    return new Promise((resolve, reject) => {
        if (!Number.isInteger(status) || status < 0 || status > 3) {
            reject(new Error('Invalid debugging mode.'));
            return;
        }
        chrome.storage.local.get({
            xdebugDebugTrigger: DEFAULT_TRIGGER_VALUE,
            xdebugTraceTrigger: DEFAULT_TRIGGER_VALUE,
            xdebugProfileTrigger: DEFAULT_TRIGGER_VALUE
        }, (settings) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            const statusMap = getStatusMap(settings);
            for (const { name } of Object.values(statusMap)) {
                setCookie(name, '', -1);
                // Also remove a host-only trigger left by another helper.
                document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
            }

            if (status > 0 && statusMap[status]) {
                const { name, trigger } = statusMap[status];
                setCookie(name, trigger);
            }

            const matches = Object.entries(statusMap).every(([idx, { name, trigger }]) =>
                +idx === status ? getCookie(name) === trigger : getCookie(name) === null
            );
            if (!matches) {
                reject(new Error('Could not update Xdebug cookies. Allow cookies for this website and remove conflicting Xdebug cookies.'));
                return;
            }
            resolve();
        });
    });
};

// Listens for messages from the background script
chrome.runtime.onMessage.addListener((msg, _, res) => {
    switch (msg.cmd) {
        case 'getStatus':
            getCurrentStatus().then(status => res({ status })).catch(error => res({ error: error.message }));
            return true;
        case 'setStatus':
            setStatus(msg.status).then(() => res({ status: msg.status })).catch(error => res({ error: error.message }));
            return true;
        case 'getDomain':
            res({ domain: getDomainForCookie() });
            return true;
        default:
            res({ status: 0 });
            return true;
    }
});
