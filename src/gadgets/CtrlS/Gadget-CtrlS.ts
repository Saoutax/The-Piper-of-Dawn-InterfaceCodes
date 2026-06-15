(() => {
    const { wgAction, wgCodeEditorCurrentLanguage } = mw.config.get(['wgAction', 'wgCodeEditorCurrentLanguage']);
    if (!['edit', 'submit'].includes(String(wgAction))) {
        return;
    }
    window.addEventListener('keydown', e => {
        if (!e.ctrlKey) {
            return;
        }
        const wpSave = document.getElementById('wpSave'),
            wpMinoredit = document.getElementById('wpMinoredit'),
            wpPreview = document.getElementById('wpPreview'),
            wpDiff = document.getElementById('wpDiff'),
            input = document.querySelector<HTMLButtonElement>('#wpTemplateSandboxPreview input');
        switch (e.key) {
            case 's':
                e.preventDefault();
                wpSave?.click();
                break;
            case 'S':
                e.preventDefault();
                wpMinoredit?.click();
                wpSave?.click();
                break;
            case 'V':
                e.preventDefault();
                if ('lua' === wgCodeEditorCurrentLanguage) {
                    input?.click();
                }
                wpPreview?.click();
                break;
            case 'D':
                e.preventDefault();
                wpDiff?.click();
                break;
        }
    });
})();
