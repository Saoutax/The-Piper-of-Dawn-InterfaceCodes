declare global {
    interface Window {
        activity: { id: number; spmId: string };
        reportMsgObj: Record<string, unknown>;
        reportConfig: {
            sample: number;
            extMsgs: { appBuvid: string };
            scrollTracker: boolean;
            msgObjects: string;
            pvMsg: Record<string, unknown>;
            errorTracker: boolean;
        };
        SEARCH_PARAM: { autoplay: boolean; poster: boolean; muted: boolean };
    }
}

window.activity = { id: 11610, spmId: '888.211' };
window.reportMsgObj = {};
window.reportConfig = {
    sample: 1,
    extMsgs: { appBuvid: (navigator.userAgent.match(/Buvid\/([a-zA-Z0-9]+)/) || [])[1] || '' },
    scrollTracker: true,
    msgObjects: 'reportMsgObj',
    pvMsg: {},
    errorTracker: true,
};
window.SEARCH_PARAM = { autoplay: false, poster: true, muted: false };
try {
    document.domain = 'bilibili.com';
} catch {}
