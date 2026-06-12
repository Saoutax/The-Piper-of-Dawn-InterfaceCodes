$(() => {
    const params = new URLSearchParams(window.location.search),
        wpReason = params.get('wpReason');
    if (mw.config.get('wgAction') === 'delete' && !wpReason) {
        $('#wpReason').val('');
    }
});
