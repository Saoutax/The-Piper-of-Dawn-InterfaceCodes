(window.RLQ ||= []).push([
    'mediawiki.base',
    () => {
        const { wgCanonicalSpecialPageName } = mw.config.get();
        const allowList = ['Preferences', 'Gadgets', 'Userlogin'];
        if (wgCanonicalSpecialPageName && allowList.includes(wgCanonicalSpecialPageName)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://wiki.biligame.com/pod/load.php?lang=zh-cn&modules=site.styles&only=styles&skin=vector';
            document.head.append(link);
        }
    },
]);
