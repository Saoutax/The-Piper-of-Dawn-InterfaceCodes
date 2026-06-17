/* ===== 设备判断 ===== */
const ua = navigator.userAgent.toLowerCase();
let shebei = '';
if (/android|adr/gi.test(ua)) {
    shebei = 'android';
} else if (/\(i[^;]+;( U;)? CPU.+Mac OS X/gi.test(ua) || /iPad/gi.test(ua)) {
    shebei = 'ios';
} else if (/windows nt/.test(ua)) {
    shebei = 'pc';
}

/* ===== 结束卡数据注入（只改DOM，不改播放器UI）===== */
const _fetch = url => fetch(url).then(r => r.json());

/** 获取UP主信息 */
function _getUpInfo(mid) {
    return _fetch(`https://api.bilibili.com/x/web-interface/card?mid=${mid}&photo=true`)
        .then(res => {
            if (res.code !== 0 || !res.data || !res.data.card) {
                return null;
            }
            const c = res.data.card;
            return { mid: c.mid, name: c.uname, face: c.face, fans: c.fans };
        })
        .catch(() => null);
}

/** 监听播放器容器，ending card出现时注入UP主头像和链接 */
function _watchEndingCard(container, vd, upInfo) {
    if (!container || !vd) {
        return;
    }
    const faceUrl = upInfo?.face || vd.owner?.face || '';
    const spaceUrl = upInfo ? `//space.bilibili.com/${upInfo.mid}/` : `//space.bilibili.com/${vd.owner?.mid || 0}/`;
    const upName = upInfo?.name || vd.owner?.name || '';
    const upMid = upInfo?.mid || vd.owner?.mid || 0;

    const inject = () => {
        const avatarWrap = container.querySelector('.bpx-player-ending-functions-avatar[data-action="upinfo"]');
        if (!avatarWrap) {
            return;
        }
        const img = avatarWrap.querySelector('img');
        if (img && faceUrl) {
            img.src = faceUrl;
            img.alt = upName;
        }
        const link = avatarWrap.querySelector('a');
        if (link) {
            link.href = spaceUrl;
            link.setAttribute('data-mid', String(upMid));
        }
    };
    inject();
    new MutationObserver(inject).observe(container, { childList: true, subtree: true });
}

/* ===== BiliPlayer ===== */
class BiliPlayer {
    /* 类级计数器：第 0、1、2 … 次调用 */
    static _callCount = 0;

    /* 私有字段 */
    #playerInst = null; // nano 实例（moshi=1/2 PC端）
    #container = null; // 播放器/根容器
    #scrollWrap = null; // moshi=1/2 旧用法的滚动包装容器

    /**
     * 支持四种调用方式：
     * 1) 旧用法（moshi=1/2）：new BiliPlayer('BV1xx', page, opts)
     * 2) 指定容器（moshi=1/2）：new BiliPlayer(containerDOM, 'BV1xx', page, opts)
     * 3) multi 模式（moshi=3/4/5）：new BiliPlayer(containerDOM, opts)
     *    opts.multiMode = 'allP'    — 全分P列表（moshi=3）
     *    opts.multiMode = 'customP' — 自定义分P列表（moshi=4）
     *    opts.multiMode = 'multiBV' — 多BV列表（moshi=5）
     */
    constructor(arg1, arg2, arg3) {
        /* ---------- 参数分派 ---------- */
        const isEl = v => v instanceof HTMLElement;
        const isStr = v => typeof v === 'string';
        const isObj = v => v !== null && typeof v === 'object' && !isEl(v);

        /* multi 模式：(container, opts) */
        if ((isEl(arg1) || isStr(arg1)) && isObj(arg2) && arg2.multiMode) {
            const container = isEl(arg1) ? arg1 : document.querySelector(arg1);
            this.#container = container;
            this.#initMulti(arg2);
            return;
        }

        /* 旧用法 / 指定容器（moshi=1/2） */
        let container, bvid, page, opts;
        if (isStr(arg1) && arg1.startsWith('BV')) {
            /* 旧用法：(bvid, page, opts) */
            [bvid, page, opts] = [arg1, arg2 || 1, arg3 || {}];
            container = null;
        } else {
            /* 指定容器：(container, bvid, page, opts) */
            container = isEl(arg1) ? arg1 : document.querySelector(arg1);
            [bvid, page, opts] = [arg2, arg3 || 1, arguments[3] || {}];
        }

        /* 1. 创建或复用容器 */
        if (!container) {
            this.#scrollWrap = document.createElement('div');
            this.#scrollWrap.className = 'b3-scroll-wrap';
            if (opts.scrollContent) {
                this.#scrollWrap.innerHTML = opts.scrollContent;
            }
            container = document.createElement('div');
            container.className = 'biliplayerW-dom';
            container.id = `d${BiliPlayer._callCount}`;
            this.#scrollWrap.appendChild(container);
            const anchors = document.getElementsByClassName('player-anchor');
            const targetAnchor = anchors[BiliPlayer._callCount];
            (targetAnchor || document.body).appendChild(this.#scrollWrap);
            BiliPlayer._callCount++;
        }
        this.#container = container;

        /* 2. 提取配置 */
        const { width = '100%', height = '400px', autoplay = false, muted = false, ...otherOpts } = opts;

        /* 3. 移动端 / PC 端区分渲染 */
        if (shebei === 'android' || shebei === 'ios') {
            this.#container.style.cssText = `width:${width};height:${height};max-width:100%;`;
            this.#container.innerHTML = `<iframe name="video-frame"
                     src="https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid=${encodeURIComponent(bvid)}&p=${encodeURIComponent(page)}${autoplay ? '&autoplay' : ''}"
                     frameborder="no" scrolling="no" allowfullscreen
                     style="width:100%;height:100%;"></iframe>`;
            this.ready = Promise.resolve(this);
            this.#playerInst = null;
        } else {
            if (!window.nano) {
                throw new Error('未检测到 nano 播放器 SDK');
            }
            this.#container.style.cssText = `width:${width};height:${height};max-width:100%;`;
            this.#playerInst = window.nano.createPlayer({
                element: this.#container,
                bvid,
                p: parseInt(page, 10),
                autoplay,
                muted,
                poster: true,
                stats: { bSource: 'widget_demo' },
                ...otherOpts,
            });

            /* 先拉视频信息获取owner数据，再监听ending card注入 */
            _fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)
                .then(async res => {
                    if (res.code !== 0 || !res.data) {
                        return;
                    }
                    const vd = res.data;
                    const upInfo = await _getUpInfo(vd.owner.mid);
                    /* 播放器connect后注入UP主数据到ending card */
                    this.#playerInst
                        .connect()
                        .then(() => {
                            console.log(`播放器 ${this.#container.id} 加载成功`);
                            _watchEndingCard(this.#container, vd, upInfo);
                        })
                        .catch(err => console.error(`播放器 ${this.#container.id} 连接失败`, err));
                })
                .catch(err => console.error(`播放器 ${this.#container.id} 获取视频信息失败`, err));

            this.ready = this.#playerInst
                .connect()
                .then(() => this)
                .catch(err => {
                    console.error(`播放器 ${this.#container.id} 加载失败`, err);
                    throw err;
                });
        }
    }

    /* ------------------------------------------------------------------ */
    /* multi 模式初始化（moshi=3/4/5 公共入口）                             */
    /* ------------------------------------------------------------------ */
    #initMulti(opts) {
        const {
            multiMode, // 'allP' | 'customP' | 'multiBV'
            bvid = '', // moshi=3/4 用
            pages = [], // moshi=4：指定的分P编号数组
            bvArr = [], // moshi=5：多BV数组
            width = '100%',
            height = '400px',
        } = opts;

        /* 生成唯一 uid 避免多实例样式冲突 */
        const uid = 'bp' + Date.now() + Math.random().toString(36).substr(2, 5);
        const wrap = this.#container;
        wrap.id = uid;

        /* 注入样式 */
        const style = document.createElement('style');
        style.textContent = `
                #${uid} .bpm-player{
                    width:${width};height:${height};max-width:100%;margin-bottom:10px;
                }
                #${uid} .bpm-scroll-wrap{
                    overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch;
                }
                #${uid} .bpm-pagelist{
                    display:inline-flex;gap:8px;padding:0 2px;
                }
                #${uid} .bpm-part{
                    flex:0 0 auto;padding:6px 12px;border:1px solid #e5e5e5;
                    border-radius:4px;cursor:pointer;background:#fff;color:#222;
                    transition:all .2s;user-select:none;
                }
                #${uid} .bpm-part:hover{ border-color:#999 !important; }
                #${uid} .bpm-part.active{
                    background:#00aeec !important;color:#fff !important;border-color:#00aeec !important;
                }
            `;
        wrap.appendChild(style);

        /* 注入结构 */
        const playerDiv = document.createElement('div');
        playerDiv.className = 'bpm-player';
        const scrollWrap = document.createElement('div');
        scrollWrap.className = 'bpm-scroll-wrap';
        const listDiv = document.createElement('div');
        listDiv.className = 'bpm-pagelist';
        scrollWrap.appendChild(listDiv);
        wrap.appendChild(playerDiv);
        wrap.appendChild(scrollWrap);

        /* 当前 multi 区域内活跃的 nano 实例（PC端切换时需要先销毁） */
        let activeNano = null;

        /* 点击切换监听 */
        listDiv.addEventListener('click', e => {
            const btn = e.target.closest('.bpm-part');
            if (!btn) {
                return;
            }
            listDiv.querySelectorAll('.bpm-part').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (multiMode === 'multiBV') {
                activeNano = this.#loadVideo(playerDiv, btn.dataset.bv, 1, width, height, activeNano);
            } else {
                activeNano = this.#loadVideo(playerDiv, bvid, parseInt(btn.dataset.p, 10), width, height, activeNano);
            }
        });

        /* 根据模式执行不同的数据获取，并将 activeNano 回写 */
        const onFirstLoad = inst => {
            activeNano = inst;
        };

        if (multiMode === 'allP') {
            this.#fetchAndRenderAllP(bvid, playerDiv, listDiv, width, height, onFirstLoad);
        } else if (multiMode === 'customP') {
            this.#fetchAndRenderCustomP(bvid, pages, playerDiv, listDiv, width, height, onFirstLoad);
        } else if (multiMode === 'multiBV') {
            this.#fetchAndRenderMultiBV(bvArr, playerDiv, listDiv, width, height, onFirstLoad);
        }

        this.ready = Promise.resolve(this);
    }

    /**
     * 加载播放器（PC 端用 nano，移动端用 iframe）
     * @param {HTMLElement} playerEl  播放器挂载容器
     * @param {string}      bvid
     * @param {number}      page
     * @param {string}      width
     * @param {string}      height
     * @param {object|null} prevNano  上一个 nano 实例，切换前销毁
     * @returns {object|null}         新的 nano 实例（移动端返回 null）
     */
    #loadVideo(playerEl, bvid, page, width, height, prevNano) {
        /* 先销毁旧的 nano 实例 */
        if (prevNano && prevNano.destroy) {
            prevNano.destroy();
        }
        /* 清空容器 */
        playerEl.innerHTML = '';
        playerEl.style.cssText = `width:${width};height:${height};max-width:100%;`;

        if (shebei === 'android' || shebei === 'ios') {
            /* 移动端：iframe */
            const url = `https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid=${encodeURIComponent(bvid)}&p=${encodeURIComponent(page)}&autoplay`;
            playerEl.innerHTML = `<iframe name="video-frame" src="${url}"
                     frameborder="no" scrolling="no" allowfullscreen
                     style="width:100%;height:100%;"></iframe>`;
            return null;
        } else {
            /* PC 端：nano */
            if (!window.nano) {
                playerEl.innerHTML =
                    '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#f66;">未检测到 nano 播放器 SDK</div>';
                return null;
            }
            const nanoInst = window.nano.createPlayer({
                element: playerEl,
                bvid,
                p: parseInt(page, 10),
                autoplay: false,
                muted: false,
                poster: true,
                stats: { bSource: 'widget_demo' },
            });

            /* 异步拉取视频信息获取owner数据，用于ending card注入 */
            _fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)
                .then(async res => {
                    if (res.code !== 0 || !res.data) {
                        return;
                    }
                    const vd = res.data;
                    const upInfo = await _getUpInfo(vd.owner.mid);
                    nanoInst
                        .connect()
                        .then(() => {
                            console.log(`[BiliPlayer multi] ${bvid} P${page} 加载成功`);
                            _watchEndingCard(playerEl, vd, upInfo);
                        })
                        .catch(err => console.error(`[BiliPlayer multi] ${bvid} P${page} 加载失败`, err));
                })
                .catch(() => {});

            return nanoInst;
        }
    }

    /* moshi=3：全分P列表 */
    #fetchAndRenderAllP(bvid, playerEl, listEl, width, height, onFirstLoad) {
        fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)
            .then(r => r.json())
            .then(res => {
                if (res.code !== 0 || !res.data || !res.data.pages) {
                    playerEl.innerHTML =
                        '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#f66;">获取视频信息失败</div>';
                    return;
                }
                res.data.pages.forEach(p => {
                    const btn = document.createElement('div');
                    btn.className = 'bpm-part';
                    btn.textContent = `P${p.page} · ${p.part}`;
                    btn.dataset.p = p.page;
                    listEl.appendChild(btn);
                });
                /* 默认播放 P1 */
                const inst = this.#loadVideo(playerEl, bvid, 1, width, height, null);
                onFirstLoad(inst);
                listEl.querySelector('.bpm-part')?.classList.add('active');
            })
            .catch(() => {
                playerEl.innerHTML =
                    '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#f66;">网络异常，无法获取分P信息</div>';
            });
    }

    /* moshi=4：自定义分P列表 */
    #fetchAndRenderCustomP(bvid, pageArr, playerEl, listEl, width, height, onFirstLoad) {
        fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)
            .then(r => r.json())
            .then(res => {
                if (res.code !== 0 || !res.data || !res.data.pages) {
                    playerEl.innerHTML =
                        '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#f66;">获取视频信息失败</div>';
                    return;
                }
                const allPages = res.data.pages;
                pageArr.forEach(pNum => {
                    const pageObj = allPages.find(o => o.page === pNum);
                    if (!pageObj) {
                        return;
                    }
                    const btn = document.createElement('div');
                    btn.className = 'bpm-part';
                    btn.textContent = `P${pageObj.page} · ${pageObj.part}`;
                    btn.dataset.p = pageObj.page;
                    listEl.appendChild(btn);
                });
                /* 默认播放第一个指定的分P */
                const defaultP = pageArr[0] || 1;
                const inst = this.#loadVideo(playerEl, bvid, defaultP, width, height, null);
                onFirstLoad(inst);
                listEl.querySelector(`.bpm-part[data-p="${defaultP}"]`)?.classList.add('active');
            })
            .catch(() => {
                playerEl.innerHTML =
                    '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#f66;">网络异常，无法获取分P信息</div>';
            });
    }

    /* moshi=5：多BV列表 */
    #fetchAndRenderMultiBV(bvArr, playerEl, listEl, width, height, onFirstLoad) {
        void Promise.all(
            bvArr.map(bvid =>
                fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`)
                    .then(r => r.json())
                    .then(res => ({
                        bvid,
                        title: res.code === 0 && res.data ? res.data.title : '（获取失败）',
                    }))
                    .catch(() => ({ bvid, title: '（网络错误）' })),
            ),
        ).then(list => {
            list.forEach((item, idx) => {
                const btn = document.createElement('div');
                btn.className = 'bpm-part';
                btn.textContent = `L${idx + 1}·${item.title}`;
                btn.dataset.bv = item.bvid;
                listEl.appendChild(btn);
            });
            /* 默认播放第一个 */
            if (list.length > 0) {
                const inst = this.#loadVideo(playerEl, list[0].bvid, 1, width, height, null);
                onFirstLoad(inst);
                listEl.querySelector('.bpm-part')?.classList.add('active');
            }
        });
    }

    /* 对外暴露 nano 实例（移动端 / multi 模式始终为 null） */
    get player() {
        return this.#playerInst;
    }

    /* 设置滚动容器内容（兼容旧接口） */
    setScrollContent(content) {
        if (this.#scrollWrap) {
            this.#scrollWrap.innerHTML = content;
        }
    }

    /* 销毁：停止播放并移除 DOM */
    destroy() {
        if (this.#playerInst && this.#playerInst.destroy) {
            this.#playerInst.destroy();
        }
        if (this.#scrollWrap) {
            this.#scrollWrap.remove();
        } else {
            this.#container?.remove();
        }
        this.#playerInst = null;
        this.#container = null;
        this.#scrollWrap = null;
    }
}
(window.RLQ = window.RLQ || []).push([
    'jquery',
    'ext.gadget.libBilibiliVideo',
    () => {
        $(() => {
            if (window.biliplayerWc == undefined) {
                window.biliplayerWc = 0;
            }

            /* 当前实例对应的 .BiliPlayer 根元素 */
            const rootEl = document.querySelectorAll('.BiliPlayer')[window.biliplayerWc];

            var val1 = rootEl.getAttribute('data-moshi') || ``;
            var val2 = rootEl.getAttribute('data-mode') || ``;
            var mode = ``;
            if (val2 === `` || val2 === undefined) {
                mode = val1;
            } else {
                mode = val2;
            }
            if (mode == ``) {
                mode = `1`;
            }

            switch (mode) {
                /* -------- moshi=1：单P，直接指定分P编号 -------- */
                case `1`: {
                    rootEl.innerHTML = `<div class="player-anchor"></div>`;
                    const bv = rootEl.getAttribute('data-bv') || ``;
                    const p = rootEl.getAttribute('data-P') || '1';
                    const w = rootEl.getAttribute('data-w') || '100%';
                    const h = rootEl.getAttribute('data-h') || '400px';
                    new BiliPlayer(bv, p, { width: w, height: h, autoplay: false });
                    break;
                }

                /* -------- moshi=2：按分P名称查找 -------- */
                case `2`: {
                    rootEl.innerHTML = `<div class="player-anchor"></div>`;
                    const Bvid = rootEl.getAttribute('data-bv') || ``;
                    const Pname = rootEl.getAttribute('data-Pname') || ``;
                    const w = rootEl.getAttribute('data-w') || '100%';
                    const h = rootEl.getAttribute('data-h') || '400px';
                    fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${Bvid}`)
                        .then(r => r.json())
                        .then(res => {
                            const page = res.data.pages.find(p => p.part === Pname)?.page || 1;
                            new BiliPlayer(Bvid, page, { width: w, height: h, autoplay: false });
                        })
                        .catch(err => {
                            console.error('case2 捕获异常:', err);
                            rootEl.innerHTML =
                                '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#f66;">获取分P失败</div>';
                        });
                    break;
                }

                /* -------- moshi=3：全分P列表（BiliPlayer multi=allP） -------- */
                case `3`: {
                    const Bvid = rootEl.getAttribute('data-bv') || ``;
                    const w = rootEl.getAttribute('data-w') || '100%';
                    const h = rootEl.getAttribute('data-h') || '400px';
                    /* 将根元素本身作为容器交给 BiliPlayer */
                    new BiliPlayer(rootEl, {
                        multiMode: 'allP',
                        bvid: Bvid,
                        width: w,
                        height: h,
                    });
                    break;
                }

                /* -------- moshi=4：自定义分P列表（BiliPlayer multi=customP） -------- */
                case `4`: {
                    const Bvid = rootEl.getAttribute('data-bv') || ``;
                    const rawP = rootEl.getAttribute('data-P') || ``;
                    const w = rootEl.getAttribute('data-w') || '100%';
                    const h = rootEl.getAttribute('data-h') || '400px';
                    const pageArr = rawP
                        .replace(/，|、/g, ',')
                        .split(',')
                        .map(s => parseInt(s.trim(), 10))
                        .filter(n => !isNaN(n) && n > 0);
                    new BiliPlayer(rootEl, {
                        multiMode: 'customP',
                        bvid: Bvid,
                        pages: pageArr.length ? pageArr : [1],
                        width: w,
                        height: h,
                    });
                    break;
                }

                /* -------- moshi=5：多BV列表（BiliPlayer multi=multiBV） -------- */
                case `5`: {
                    const rawBV = rootEl.getAttribute('data-bv') || ``;
                    const w = rootEl.getAttribute('data-w') || '100%';
                    const h = rootEl.getAttribute('data-h') || '400px';
                    const bvArr = rawBV
                        .replace(/，|、/g, ',')
                        .split(',')
                        .map(s => s.trim())
                        .filter(v => v);
                    new BiliPlayer(rootEl, {
                        multiMode: 'multiBV',
                        bvArr: bvArr.length ? bvArr : ['BV1xx411c7mD'],
                        width: w,
                        height: h,
                    });
                    break;
                }
            }

            window.biliplayerWc = window.biliplayerWc + 1;
        });
    },
]);
