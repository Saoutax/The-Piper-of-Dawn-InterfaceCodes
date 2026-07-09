interface User {
    userid: number;
    name: string;
    groups: string[];
}

interface CacheEntry<T> {
    data: T;
    expiry: number;
}

const CACHE_KEY_PREFIX = 'BWikiUser:';
const CACHE_TTL = {
    GROUPS: 24 * 60 * 60 * 1000,
    AVATAR: 24 * 60 * 60 * 1000,
    BILIBILI_NICK: 24 * 60 * 60 * 1000,
};

function cacheGet<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY_PREFIX + key);
        if (!raw) {
            return null;
        }
        const entry: CacheEntry<T> = JSON.parse(raw);
        if (Date.now() > entry.expiry) {
            localStorage.removeItem(CACHE_KEY_PREFIX + key);
            return null;
        }
        return entry.data;
    } catch {
        return null;
    }
}

function cacheSet<T>(key: string, data: T, ttl: number): void {
    try {
        const entry: CacheEntry<T> = { data, expiry: Date.now() + ttl };
        localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(entry));
    } catch {
        // localStorage 不可用，静默失败
    }
}

(async () => {
    const { wgUserGroups, wgDBname } = mw.config.get(['wgUserGroups', 'wgDBname']);
    const hasApiHighLimits = wgUserGroups?.includes('sysop') || wgUserGroups?.includes('bot');

    const userGroup: Record<string, string> = {
        bureaucrat: '行政员',
        checkuser: '用户查核员',
        suppress: '监督员',
        sysop: '管理员',
        'interface-admin': '界面管理员',
        widgeteditor: '小部件编辑者',
        moderator: '版主',
        automoderated: '自动版主化用户',
        bot: '机器人',
    };

    const allUserNames: Set<string> = new Set();
    const nicknameMap = new Map<string, string>();
    const userGroupsMap = new Map<string, string[]>();
    const avatarCache = new Map<string, { face?: string }>();

    const insertAvatar = (el: HTMLAnchorElement, uid: string) => {
        if (el.previousElementSibling?.classList.contains('buser_avatar')) {
            return;
        }
        el.insertAdjacentHTML(
            'beforebegin',
            `<span class="buser_avatar buser_${uid}_avatar" data-uid="${uid}"></span>`,
        );
    };

    const renderAvatar = (uid: string, data: { face?: string }) => {
        const src = data.face || '';
        const html = src
            ? `<a href="https://space.bilibili.com/${uid}" target="_blank" rel="noopener noreferrer"><img src="${src}" decoding="async"></a>`
            : '';
        document.querySelectorAll(`.buser_${uid}_avatar`).forEach(el => {
            el.innerHTML = html;
        });
    };

    const renderAvatars = async (uids: string[]) => {
        const numericUids = uids.filter(uid => /^\d+$/.test(uid));
        await Promise.all(
            numericUids.map(async uid => {
                const cached = avatarCache.get(uid);
                if (cached) {
                    renderAvatar(uid, cached);
                    return;
                }

                const stored = cacheGet<{ face?: string }>(`avatar:${uid}`);
                if (stored) {
                    avatarCache.set(uid, stored);
                    renderAvatar(uid, stored);
                    return;
                }

                try {
                    const res = await fetch(
                        `https://line1-h5-pc-api.biligame.com/game/user/space/user_detail?uid=${uid}`,
                    );
                    const data = (await res.json())?.data;
                    if (data) {
                        avatarCache.set(uid, data);
                        cacheSet(`avatar:${uid}`, data, CACHE_TTL.AVATAR);
                        renderAvatar(uid, data);
                    }
                } catch {
                    // 静默失败
                }
            }),
        );
    };

    const renderGroups = () => {
        document.querySelectorAll<HTMLAnchorElement>('a.mw-userlink').forEach(element => {
            const username = element.dataset['username'];
            if (!username) {
                return;
            }
            if (element.nextElementSibling?.classList.contains('bwiki-user-group')) {
                return;
            }

            const groups = userGroupsMap.get(username);
            if (!groups) {
                return;
            }

            Object.keys(userGroup)
                .reverse()
                .forEach(key => {
                    if (groups.includes(key)) {
                        const sup = document.createElement('sup');
                        sup.className = 'bwiki-user-group';
                        const group = userGroup[key]!;
                        const span = document.createElement('span');
                        span.className = `bwiki-user-group-${key}`;
                        span.title = group;
                        sup.appendChild(span);
                        element.after(sup);
                    }
                });
        });
    };

    const processContent = async () => {
        const pendingLinks: HTMLAnchorElement[] = [];

        document.querySelectorAll<HTMLAnchorElement>('a.mw-userlink').forEach(element => {
            if (element.dataset['username']) {
                return;
            }

            const username = element.textContent.replace(/\((\d+)\)/g, '$1');
            element.dataset['username'] = username;
            const previousElement = element.previousElementSibling;
            const secondPreviousElement = element.previousElementSibling?.previousElementSibling;
            if (
                previousElement?.tagName === 'BDI' &&
                secondPreviousElement?.tagName === 'BDI' &&
                secondPreviousElement?.textContent !== ''
            ) {
                const nickname = secondPreviousElement.textContent.trim();
                nicknameMap.set(username, nickname);
                secondPreviousElement.insertAdjacentHTML(
                    'beforebegin',
                    `<span class="buser_avatar buser_${username}_avatar" data-uid="${username}"></span>`,
                );
                previousElement.remove();
                secondPreviousElement.remove();
                element.textContent = ' ' + nickname;
                allUserNames.add(username);
            } else {
                pendingLinks.push(element);
            }
        });

        const needApiUids: string[] = [];
        pendingLinks.forEach(element => {
            const username = element.dataset['username']!;
            const nickname = nicknameMap.get(username);
            if (nickname) {
                insertAvatar(element, username);
                element.textContent = ' ' + nickname;
            } else if (/^\d+$/.test(username)) {
                needApiUids.push(username);
            }
            allUserNames.add(username);
        });

        if (needApiUids.length > 0) {
            const uniqueUids = [...new Set(needApiUids)];
            await Promise.all(
                uniqueUids.map(async uid => {
                    const cachedNick = cacheGet<string>(`nick:${uid}`);
                    if (cachedNick) {
                        nicknameMap.set(uid, cachedNick);
                        document
                            .querySelectorAll<HTMLAnchorElement>(`a.mw-userlink[data-username="${uid}"]`)
                            .forEach(el => {
                                insertAvatar(el, uid);
                                el.textContent = ' ' + cachedNick;
                                allUserNames.add(uid);
                            });
                        return;
                    }
                    try {
                        const res = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${uid}`);
                        const json = await res.json();
                        if (json?.code === 0 && json?.data?.card?.name) {
                            const nickname = json.data.card.name;
                            nicknameMap.set(uid, nickname);
                            cacheSet(`nick:${uid}`, nickname, CACHE_TTL.BILIBILI_NICK);
                            document
                                .querySelectorAll<HTMLAnchorElement>(`a.mw-userlink[data-username="${uid}"]`)
                                .forEach(el => {
                                    insertAvatar(el, uid);
                                    el.textContent = ' ' + nickname;
                                    allUserNames.add(uid);
                                });
                        }
                    } catch {
                        // 静默失败
                    }
                }),
            );
        }
    };

    const hook = async () => {
        const beforeKnownUsers = new Set(userGroupsMap.keys());

        await processContent();

        const newUsers = [...allUserNames].filter(u => {
            if (beforeKnownUsers.has(u)) {
                return false;
            }
            const cached = cacheGet<string[]>(`group:${wgDBname}:${u}`);
            if (cached) {
                userGroupsMap.set(u, cached);
                return false;
            }
            return true;
        });
        if (newUsers.length > 0) {
            const chunkSize = hasApiHighLimits ? 500 : 50;
            const chunks: string[][] = [];
            for (let i = 0; i < newUsers.length; i += chunkSize) {
                chunks.push(newUsers.slice(i, i + chunkSize));
            }

            const results = await Promise.all(
                chunks.map(chunk =>
                    new mw.Api().post({
                        action: 'query',
                        list: 'users',
                        ususers: chunk.join('|'),
                        usprop: 'groups',
                        format: 'json',
                        formatversion: '2',
                    }),
                ),
            );

            results.forEach(result => {
                result['query']['users'].forEach((user: User) => {
                    userGroupsMap.set(user.name, user.groups);
                    cacheSet(`group:${wgDBname}:${user.name}`, user.groups, CACHE_TTL.GROUPS);
                });
            });
        }

        void renderAvatars([...allUserNames]);
        renderGroups();
    };

    let currentHook = Promise.resolve();
    let hookPending = false;
    const guardedHook = () => {
        if (hookPending) {
            return;
        }
        hookPending = true;
        const prev = currentHook;
        currentHook = (async () => {
            await prev;
            await hook();
            hookPending = false;
        })();
    };

    guardedHook();
    mw.hook('wikipage.content').add(guardedHook);
})();
