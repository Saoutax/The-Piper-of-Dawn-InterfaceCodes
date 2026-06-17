function noop() {
    /* empty */
}

/**
 * @returns {boolean}
 */
function isIframe() {
    return window.parent !== window;
}

/**
 * @returns {boolean}
 */
function isSameOriginIframe() {
    if (isIframe()) {
        try {
            return !!window.parent.document;
        } catch (e) {
            return false;
        }
    }
    return false;
}

/**
 * @param {string[]} [hostList]
 * @returns {boolean}
 */
function isOfficialReferrer(hostList) {
    hostList = hostList || ['bilibili.co', 'bilibili.com', 'biligame.com'];
    if (isIframe()) {
        try {
            const matches = document.referrer.match(/^http(s)?:\/\/(.*?)\//);
            const referrerHost = matches && matches[2];
            return hostList.some((host) => referrerHost.includes(host));
        } catch (e) {
            return false;
        }
    } else {
        return true;
    }
}

/**
 * @param {string[]} [referrerList]
 * @returns {boolean}
 */
function isCertifiedReferrer(referrerList) {
    referrerList = referrerList || window.REFERRER_LIST;
    if (isIframe() && referrerList) {
        try {
            const matches = document.referrer.match(/^http(s)?:\/\/(.*?)\//);
            const host = matches && matches[2];
            const reg = new RegExp(referrerList.join('|').replace(/\./g, '\\.').replace(/\*/g, '.*'));
            return !!(host && reg.test(host));
        } catch (e) {
            return true;
        }
    } else {
        return true;
    }
}

/**
 * @param {string} name
 * @returns {string}
 */
function getCookie(name) {
    const ret = '';
    if (name == null) return ret;
    const cookies = document.cookie.split(';');
    const decodeCookieName = decodeURIComponent(name);
    for (let i = 0; i < cookies.length; i++) {
        const ck = cookies[i] || '';
        const kv = ck.trim().split('=');
        const key = kv[0];
        const value = kv[1];
        if (decodeURIComponent(key) === decodeCookieName) {
            return value ? decodeURIComponent(value) : value;
        }
    }
    return ret;
}

/**
 * @param {string} name
 * @returns {null|string}
 */
function getUrlValue(name) {
    const reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
    const r = window.location.search.slice(1).match(reg);
    if (r != null) {
        try {
            return decodeURIComponent(r[2]);
        } catch (e) {
            return null;
        }
    }
    return null;
}

/**
 * @param {Object} paramType - e.g: `{ a: 'number', b: 'string }`
 * @returns {Object}
 */
function getNormalQuery(paramType) {
    const TypeMap = { number: 'number', boolean: 'boolean', string: 'string' };
    const o = Object.create(null);

    Object.keys(paramType).forEach(function (key) {
        const value = getUrlValue(key);
        if (!value) return;

        switch (paramType[key]) {
            case TypeMap.number:
                o[key] = +value;
                break;
            case TypeMap.boolean:
                switch (value) {
                    case 'true':
                        o[key] = true;
                        break;
                    case 'false':
                        o[key] = false;
                        break;
                    default:
                        o[key] = !!+value;
                        break;
                }
                break;
            case TypeMap.string:
                o[key] = value;
                break;
        }
    });
    return o;
}

/**
 * @param {string} metaName
 * @returns {string}
 */
function getMetaContent(metaName) {
    const metas = document.getElementsByTagName('meta');
    for (let i = 0; i < metas.length; i++) {
        if (metas[i].getAttribute('name') === metaName) {
            return metas[i].getAttribute('content');
        }
    }
    return '';
}

/**
 * @param {string} srcUrl
 * @param {WindowProxy} [targetWindow]
 * @returns {Promise<unknown>}
 */
function fetchScript(srcUrl, targetWindow) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        targetWindow = targetWindow || window;
        script.onload = resolve;
        script.onerror = reject;
        script.crossorigin = 'anonymous';
        script.src = srcUrl;
        targetWindow.document.head.appendChild(script);
    });
}

/**
 * @desc Player Util
 * @desc Pure JavaScript
 */
window.PlayerUtil = {
    noop,
    isIframe,
    isSameOriginIframe,
    isOfficialReferrer,
    isCertifiedReferrer,
    getCookie,
    getUrlValue,
    getNormalQuery,
    getMetaContent,
    fetchScript,
};
