document.addEventListener('DOMContentLoaded', async () => {
    const form = document.querySelector('form');
    const fields = {
        xdebugDebugTrigger: document.getElementById('debugtrigger'),
        xdebugTraceTrigger: document.getElementById('tracetrigger'),
        xdebugProfileTrigger: document.getElementById('profiletrigger')
    };
    const feedback = document.getElementById('status');
    const fieldset = form.querySelector('fieldset');
    const help = document.getElementById('help');

    document.querySelectorAll('[data-locale]').forEach(element => {
        element.textContent = element.dataset.locale === 'extension_name'
            ? chrome.runtime.getManifest().name
            : chrome.i18n.getMessage(element.dataset.locale);
    });

    form.addEventListener('reset', event => {
        event.preventDefault();
        Object.values(fields).forEach(input => { input.value = ''; });
        feedback.textContent = 'Fields cleared. Select Save to apply.';
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        fieldset.disabled = true;
        try {
            const settings = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value]));
            await chrome.storage.local.set(settings);
            form.classList.add('success');
            feedback.textContent = 'Saved. Select a mode again on your website to apply the new triggers.';
            setTimeout(() => form.classList.remove('success'), 1500);
        } catch {
            feedback.textContent = 'Could not save settings. Try again.';
        } finally {
            fieldset.disabled = false;
        }
    });

    fieldset.disabled = true;
    try {
        const defaults = Object.fromEntries(Object.keys(fields).map(key => [key, '']));
        const settings = await chrome.storage.local.get(defaults);
        Object.entries(fields).forEach(([key, input]) => { input.value = settings[key]; });
        fieldset.disabled = false;
        feedback.textContent = '';
    } catch {
        feedback.textContent = 'Could not load settings. Close and reopen this page before editing.';
    }

    try {
        const commands = await chrome.commands.getAll();
        const assigned = commands.filter(command => command.shortcut);
        for (const { shortcut, description } of assigned) {
            const paragraph = document.createElement('p');
            const key = document.createElement('kbd');
            key.textContent = shortcut;
            paragraph.append(key, document.createTextNode(` ${description || chrome.i18n.getMessage('options_execute_action')}`));
            help.appendChild(paragraph);
        }
        if (!assigned.length) throw new Error('No shortcuts');
    } catch {
        const paragraph = document.createElement('p');
        paragraph.textContent = 'Shortcuts are unavailable. Use the Safari toolbar button instead.';
        help.appendChild(paragraph);
    }
});
