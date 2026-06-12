(() => {
    const { wgPageName } = mw.config.get();
    const titles = ['特殊:参数设置', '特殊:小工具'];
    if (titles.includes(wgPageName)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://wiki.biligame.com/pod/MediaWiki:Common.css?action=raw&ctype=text/css';
        document.head.appendChild(link);
    }
})();
