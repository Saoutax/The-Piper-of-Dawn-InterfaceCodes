interface User {
    userid: number;
    name: string;
    groups: string[];
}

interface UserGroup {
    [groupname: string]: {
        label: string;
        color: string;
        name: string;
    };
}

(async () => {
    const userGroup: UserGroup = {
        bureaucrat: { label: '政', color: '#6610f2', name: '行政员' },
        checkuser: { label: '查', color: '#673ab7', name: '用户查核员' },
        suppress: { label: '监', color: '#9c27b0', name: '监督员' },
        sysop: { label: '管', color: '#ec407a', name: '管理员' },
        'interface-admin': {
            label: '界',
            color: '#f55b42',
            name: '界面管理员',
        },
        widgeteditor: { label: '部', color: '#b39fda', name: '小部件编辑者' },
        moderator: { label: '审', color: '#f77f38', name: '版主' },
        automoderated: { label: '免', color: '#1aa179', name: '自动版主化用户' },
        bot: { label: '机', color: '#1e88e5', name: '机器人' },
    };

    const style = document.createElement('style');
    style.textContent = `.buser_avatar img{height:24px;width:auto;margin:2px;border-radius:15px;border:1px solid #daa52040;image-rendering:auto}`;
    document.head.appendChild(style);

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
        const html = src ? `<img src="${src}" decoding="async">` : '';
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
                try {
                    const res = await fetch(
                        `https://line1-h5-pc-api.biligame.com/game/user/space/user_detail?uid=${uid}`,
                    );
                    const data = (await res.json())?.data;
                    if (data) {
                        avatarCache.set(uid, data);
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
                        Object.assign(span, {
                            title: group.name,
                            textContent: group.label,
                        });
                        Object.assign(span.style, {
                            color: group.color,
                            fontSize: '110%',
                            cursor: 'help',
                            marginLeft: '1px',
                        });
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
                allUserNames.add(username);
            } else if (/^\d+$/.test(username)) {
                needApiUids.push(username);
            }
        });

        if (needApiUids.length > 0) {
            const uniqueUids = [...new Set(needApiUids)];
            await Promise.all(
                uniqueUids.map(async uid => {
                    try {
                        const res = await fetch(`https://api.bilibili.com/x/web-interface/card?mid=${uid}`);
                        const json = await res.json();
                        if (json?.code === 0 && json?.data?.card?.name) {
                            const nickname = json.data.card.name;
                            nicknameMap.set(uid, nickname);
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

        const newUsers = [...allUserNames].filter(u => !beforeKnownUsers.has(u));
        if (newUsers.length > 0) {
            const {
                query: { users },
            } = await new mw.Api().post({
                action: 'query',
                list: 'users',
                ususers: newUsers.join('|'),
                usprop: 'groups',
                format: 'json',
                formatversion: '2',
            });
            users.forEach((user: User) => userGroupsMap.set(user.name, user.groups));
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
