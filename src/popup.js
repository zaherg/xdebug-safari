document.addEventListener('DOMContentLoaded', async () => {
    const radioButtons = document.querySelectorAll('input[name="state"]');
    const optionsLink = document.querySelector('#options');
    const feedback = document.querySelector('#status');
    let tabId;
    let currentStatus;
    const setDisabled = disabled => radioButtons.forEach(button => { button.disabled = disabled; });
    const showStatus = status => radioButtons.forEach(button => { button.checked = +button.value === status; });

    document.querySelectorAll('[data-locale]').forEach(element => {
        const message = chrome.i18n.getMessage(element.dataset.locale);
        const lastNode = element.lastChild;
        if (lastNode?.nodeType === Node.TEXT_NODE) lastNode.textContent = message;
        else if (!lastNode) element.textContent = message;
    });

    // Settings must remain reachable even on a page the extension cannot access.
    optionsLink.addEventListener('click', async event => {
        event.preventDefault();
        try {
            await chrome.runtime.openOptionsPage();
        } catch {
            feedback.textContent = 'Could not open settings. Try again from Safari’s extension settings.';
        }
    });

    setDisabled(true);
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !/^https?:\/\//.test(tab.url || '')) throw new Error('Unsupported page');
        tabId = tab.id;
        const response = await chrome.tabs.sendMessage(tabId, { cmd: 'getStatus' });
        if (!Number.isInteger(response?.status) || response.status < 0 || response.status > 3) {
            throw new Error(response?.error || 'No status');
        }
        currentStatus = response.status;
        showStatus(currentStatus);
        feedback.textContent = 'Changes apply to your next request. Reload the page to start.';
        setDisabled(false);
    } catch {
        feedback.textContent = 'Open a website, allow this extension access in Safari, then reload the page.';
    }

    radioButtons.forEach(button => {
        button.addEventListener('change', async event => {
            setDisabled(true);
            feedback.textContent = 'Updating…';
            try {
                const response = await chrome.runtime.sendMessage({
                    cmd: 'setStatus', tabId, status: +event.target.value
                });
                if (!response?.ok) throw new Error(response?.error || 'The change was not confirmed. Try again.');
                window.close();
            } catch (error) {
                showStatus(currentStatus);
                feedback.textContent = error.message;
                setDisabled(false);
            }
        });
    });
});
