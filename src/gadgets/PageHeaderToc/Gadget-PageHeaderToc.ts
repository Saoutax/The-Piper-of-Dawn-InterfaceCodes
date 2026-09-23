interface NavItem {
    text: string;
    href?: string;
    action?: string;
}

interface PanelSection {
    title: string;
    items: Array<NavItem>;
}

interface PageHeaderTocConfig {
    nav?: {
        title?: string;
        icon?: string;
        links?: Array<NavItem>;
    };
    panel?: {
        sections?: Array<PanelSection>;
    };
    toc?: {
        levels?: number;
        spy?: boolean;
    };
}

interface TocHeading {
    element: HTMLElement;
    id: string;
    level: number;
    text: string;
}

interface TocEntry extends TocHeading {
    number: string;
}

interface TocNode extends TocEntry {
    children: Array<TocNode>;
}

const CONFIG_PAGE = 'MediaWiki:Gadget-PageHeaderToc.json',
    STORAGE_KEY = 'PageHeaderToc:expanded',
    STRIP_LABEL = '目录',
    NARROW_QUERY = '(max-width: 1199px)',
    DEFAULT_LEVELS = 4,
    ACTION_TARGETS: Record<string, string> = {
        properties: '特殊:浏览/',
        move: '特殊:移动页面/',
        linkin: '特殊:链入页面/',
        linkout: '特殊:最近链出更改/',
    };

const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
};

const onReady = (callback: () => void) => {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
        callback();
    }
};

/** 顶栏高度取自 CSS 变量，样式表没加载时回落到 64 */
const readBarHeight = () => {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--pht-nav-h').trim(),
        parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 64;
};

(async () => {
    const pageName = mw.config.get('wgPageName'),
        articleId = mw.config.get('wgArticleId'),
        scriptPath = mw.config.get('wgScriptPath');

    /** 读取站内配置页；读取失败时回落到空配置，只保留目录功能 */
    const loadConfig = async (): Promise<PageHeaderTocConfig> => {
        try {
            const response = await new mw.Api().get({
                action: 'query',
                prop: 'revisions',
                titles: CONFIG_PAGE,
                rvprop: 'content',
                rvslots: 'main',
                format: 'json',
                formatversion: '2',
            });

            const content = response['query']?.['pages']?.[0]?.['revisions']?.[0]?.['slots']?.['main']?.['content'];

            return typeof content === 'string' && content.trim() ? (JSON.parse(content) as PageHeaderTocConfig) : {};
        } catch (error) {
            console.warn('[PageHeaderToc] 配置页读取失败，已跳过顶部导航配置。', error);
            return {};
        }
    };

    const resolveActionUrl = (action: string): string | null => {
        switch (action) {
            case 'edit':
            case 'purge':
            case 'history':
                return mw.util.getUrl(pageName, { action });
            case 'shortlink':
                return `${scriptPath}/?curid=${String(articleId)}`;
            default: {
                const target = ACTION_TARGETS[action];
                return target ? mw.util.getUrl(target + pageName) : null;
            }
        }
    };

    /** href 支持 $PAGE$ 与 $ID$ 两个占位符，因为 JSON 页不会展开魔术字 */
    const resolveUrl = (item: NavItem): string | null => {
        if (typeof item.href === 'string' && item.href.trim()) {
            return mw.util.getUrl(item.href.replace(/\$PAGE\$/g, pageName).replace(/\$ID\$/g, String(articleId)));
        }
        return typeof item.action === 'string' ? resolveActionUrl(item.action) : null;
    };

    const buildPanel = (config: PageHeaderTocConfig): HTMLElement | null => {
        const sections = config.panel?.sections;
        if (!sections?.length) {
            return null;
        }

        const panel = el('aside', 'pht-panel');
        panel.id = 'pht-panel';
        panel.setAttribute('aria-label', '快捷面板');

        sections.forEach(section => {
            const items = section.items ?? [];
            if (!items.length) {
                return;
            }

            panel.appendChild(el('p', 'pht-panel-title', section.title));

            const grid = el('div', 'pht-panel-grid');
            items.forEach(item => {
                const url = resolveUrl(item);
                if (url) {
                    const link = el('a', 'pht-panel-item', item.text);
                    link.href = url;
                    grid.appendChild(link);
                }
            });

            if (grid.childElementCount) {
                panel.appendChild(grid);
            }
        });

        return panel.childElementCount ? panel : null;
    };

    const buildBar = (config: PageHeaderTocConfig, hasPanel: boolean): HTMLElement | null => {
        const nav = config.nav;
        if (!nav) {
            return null;
        }

        const bar = el('header', 'pht-nav'),
            left = el('div', 'pht-nav-left'),
            right = el('div', 'pht-nav-right');

        if (hasPanel) {
            const burger = el('button', 'pht-burger');
            burger.type = 'button';
            burger.id = 'pht-burger';
            burger.setAttribute('aria-controls', 'pht-panel');
            burger.setAttribute('aria-expanded', 'false');
            burger.setAttribute('aria-label', '打开快捷面板');
            burger.append(el('span'), el('span'), el('span'));
            left.appendChild(burger);
        }

        if (nav.title) {
            const logo = el('a', 'pht-logo');
            logo.href = `${scriptPath}/`;
            if (nav.icon) {
                const icon = el('img', 'pht-logo-icon');
                icon.src = nav.icon;
                icon.alt = '';
                icon.decoding = 'async';
                // 图标挂了就整块撤掉，否则顶栏里会留一个破图占位框
                icon.addEventListener('error', () => {
                    icon.remove();
                });
                logo.appendChild(icon);
            }
            logo.appendChild(el('span', 'pht-logo-text', nav.title));
            left.appendChild(logo);
        }

        const links = el('nav', 'pht-nav-links'),
            currentUrl = mw.util.getUrl(pageName);
        links.setAttribute('aria-label', '站点导航');

        (nav.links ?? []).forEach(item => {
            const url = resolveUrl(item);
            if (!url) {
                return;
            }

            const link = el('a', 'pht-nav-link', item.text);
            link.href = url;
            if (url === currentUrl) {
                link.classList.add('pht-active');
                link.setAttribute('aria-current', 'page');
            }
            links.appendChild(link);
        });

        if (links.childElementCount) {
            left.appendChild(links);
        }

        bar.append(left, right);
        return bar;
    };

    /**
     * 取标题的锚点 id。两代解析器的输出不一样，必须都认：
     *   MW 1.39+：  <h2 id="标题">标题</h2>
     *   本 wiki 是 MW 1.37：<h2><span id=".E6.A0.87.E9.A2.98"></span>
     *                        <span class="mw-headline" id="标题">标题</span></h2>
     * 后者标题自身没有 id，真正可用的锚点在 .mw-headline 上；而前一个空 span 上那串
     * 点号编码也是 id，所以不能图省事取「第一个带 id 的后代」。
     */
    const anchorIdOf = (heading: HTMLElement): string => {
        if (heading.id) {
            return heading.id;
        }
        return heading.querySelector('.mw-headline[id]')?.id ?? '';
    };

    const collectHeadings = (maxLevel: number): Array<TocHeading> => {
        const root = document.querySelector('#mw-content-text');
        if (!root) {
            return [];
        }

        const headings: Array<TocHeading> = [];

        root.querySelectorAll<HTMLElement>('h2, h3, h4').forEach(element => {
            const level = Number(element.tagName.slice(1));
            if (level < 2 || level > maxLevel) {
                return;
            }
            // 自带目录也在 #mw-content-text 里，它那个「目录」标题（h2#mw-toc-heading）必须排除
            if (element.closest('#toc')) {
                return;
            }

            const id = anchorIdOf(element);
            // 没有可用锚点就没法跳转，跳过
            if (!id) {
                return;
            }

            const clone = element.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('.mw-editsection, .mw-editsection-like').forEach(node => node.remove());
            const text = ((clone.querySelector('.mw-headline') ?? clone).textContent ?? '').replace(/\s+/g, ' ').trim();
            if (!text) {
                return;
            }

            headings.push({ element, id, level, text });
        });

        return headings;
    };

    const numberHeadings = (headings: Array<TocHeading>): Array<TocEntry> => {
        const counters = [0, 0, 0, 0];

        return headings.map(heading => {
            const depth = heading.level - 2;
            counters[depth] = (counters[depth] ?? 0) + 1;
            for (let i = depth + 1; i < counters.length; i += 1) {
                counters[i] = 0;
            }
            return { ...heading, number: counters.slice(0, depth + 1).join('.') };
        });
    };

    const buildTree = (entries: Array<TocEntry>): Array<TocNode> => {
        const roots: Array<TocNode> = [],
            stack: Array<TocNode> = [];

        entries.forEach(entry => {
            const node: TocNode = { ...entry, children: [] };

            while (stack.length && (stack[stack.length - 1]?.level ?? 0) >= entry.level) {
                stack.pop();
            }

            const parent = stack[stack.length - 1];
            (parent ? parent.children : roots).push(node);
            stack.push(node);
        });

        return roots;
    };

    const renderNodes = (nodes: Array<TocNode>): HTMLUListElement => {
        const list = el('ul', 'pht-list');

        nodes.forEach(node => {
            const item = el('li', 'pht-item'),
                row = el('div', 'pht-row');

            if (node.children.length) {
                const toggle = el('button', 'pht-toggle');
                toggle.type = 'button';
                toggle.setAttribute('aria-expanded', 'true');
                toggle.setAttribute('aria-label', `折叠「${node.text}」`);
                toggle.addEventListener('click', () => {
                    const collapsed = item.classList.toggle('is-collapsed');
                    toggle.setAttribute('aria-expanded', String(!collapsed));
                    toggle.setAttribute('aria-label', `${collapsed ? '展开' : '折叠'}「${node.text}」`);
                });
                row.appendChild(toggle);
            } else {
                row.appendChild(el('span', 'pht-toggle-blank'));
            }

            const link = el('a', 'pht-link');
            link.href = `#${node.id}`;
            link.dataset['target'] = node.id;
            link.append(el('span', 'pht-num', node.number), el('span', 'pht-text', node.text));
            row.appendChild(link);
            item.appendChild(row);

            if (node.children.length) {
                item.appendChild(renderNodes(node.children));
            }

            list.appendChild(item);
        });

        return list;
    };

    const readExpanded = (): boolean | null => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw === null ? null : raw === '1';
        } catch {
            return null;
        }
    };

    const writeExpanded = (expanded: boolean) => {
        try {
            localStorage.setItem(STORAGE_KEY, expanded ? '1' : '0');
        } catch {
            // localStorage 不可用时静默跳过，不影响目录本身
        }
    };

    /** 滚动时高亮当前章节，并自动展开被折叠的父级 */
    const initSpy = (card: HTMLElement, entries: Array<TocEntry>, hasBar: boolean) => {
        const links = new Map<string, HTMLAnchorElement>();
        card.querySelectorAll<HTMLAnchorElement>('.pht-link').forEach(link => {
            const target = link.dataset['target'];
            if (target) {
                links.set(target, link);
            }
        });
        if (!links.size) {
            return;
        }

        // 直接用收集阶段的元素引用，不再按 id 重新查一遍
        const headings = entries.filter(entry => links.has(entry.id));

        let activeId = '',
            ticking = false,
            // 顶栏高度随断点变化，缓存一份并在 resize 时刷新，避免每帧读计算样式
            offset = hasBar ? readBarHeight() + 16 : 16;

        const reveal = (link: HTMLAnchorElement) => {
            let parent = link.parentElement?.parentElement?.closest('li.pht-item');
            while (parent) {
                parent.classList.remove('is-collapsed');
                parent
                    .querySelector<HTMLButtonElement>(':scope > .pht-row > .pht-toggle')
                    ?.setAttribute('aria-expanded', 'true');
                parent = parent.parentElement?.closest('li.pht-item');
            }
        };

        const update = () => {
            // 页面停在最顶端时没有任何标题越过阈值，此时高亮第一条而不是一条都不亮
            let current = headings[0]?.id ?? '';

            for (const heading of headings) {
                if (heading.element.getBoundingClientRect().top - offset > 0) {
                    break;
                }
                current = heading.id;
            }

            if (current === activeId) {
                return;
            }

            if (activeId) {
                links.get(activeId)?.classList.remove('pht-current');
            }
            activeId = current;

            const link = links.get(activeId);
            if (link) {
                link.classList.add('pht-current');
                reveal(link);
                link.scrollIntoView({ block: 'nearest' });
            }
        };

        const onScroll = () => {
            if (ticking) {
                return;
            }
            ticking = true;
            requestAnimationFrame(() => {
                update();
                ticking = false;
            });
        };

        update();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener(
            'resize',
            () => {
                offset = hasBar ? readBarHeight() + 16 : 16;
                onScroll();
            },
            { passive: true },
        );
    };

    const init = async () => {
        const configPromise = loadConfig();
        await new Promise<void>(resolve => {
            onReady(resolve);
        });
        const config = await configPromise;

        const panel = buildPanel(config),
            bar = buildBar(config, Boolean(panel));

        if (bar) {
            document.body.prepend(bar);
            document.documentElement.classList.add('pht-has-nav');
        }
        if (bar && panel) {
            document.body.appendChild(panel);
        }

        const headings = collectHeadings(config.toc?.levels ?? DEFAULT_LEVELS);
        if (!headings.length) {
            return;
        }
        const entries = numberHeadings(headings);

        const toc = el('div', 'pht-toc'),
            strip = el('button', 'pht-strip'),
            card = el('nav', 'pht-card'),
            head = el('div', 'pht-card-head'),
            close = el('button', 'pht-card-close'),
            body = el('div', 'pht-card-body');

        strip.type = 'button';
        strip.setAttribute('aria-controls', 'pht-card');
        strip.setAttribute('aria-expanded', 'false');
        strip.setAttribute('aria-label', '展开目录');
        // 逐字成块竖排。别改用 writing-mode: vertical-rl —— 文字一旦折成两列，
        // 列序是从右往左的，视觉上会读成「录目」。
        for (const char of STRIP_LABEL) {
            strip.appendChild(el('span', 'pht-strip-char', char));
        }

        close.type = 'button';
        close.setAttribute('aria-label', '收起目录');
        close.textContent = '×';

        body.appendChild(renderNodes(buildTree(entries)));
        head.append(el('span', 'pht-card-title', '目录'), close);

        card.id = 'pht-card';
        card.append(head, body);
        toc.append(strip, card);
        document.body.appendChild(toc);
        document.body.classList.add('pht-toc-active');

        const setExpanded = (expanded: boolean, persist: boolean) => {
            toc.classList.toggle('is-open', expanded);
            strip.setAttribute('aria-expanded', String(expanded));
            if (persist) {
                writeExpanded(expanded);
            }
        };

        // 窄屏默认收起、宽屏默认展开；用户手动切换过之后一律以记录为准
        const stored = readExpanded();
        setExpanded(stored ?? !window.matchMedia(NARROW_QUERY).matches, false);

        strip.addEventListener('click', () => {
            setExpanded(true, true);
        });
        close.addEventListener('click', () => {
            setExpanded(false, true);
        });

        if (config.toc?.spy !== false) {
            initSpy(card, entries, Boolean(bar));
        }

        if (!bar || !panel) {
            return;
        }

        const burger = bar.querySelector<HTMLButtonElement>('#pht-burger');
        if (!burger) {
            return;
        }

        let restoreToc = false;

        const setPanelOpen = (open: boolean) => {
            panel.classList.toggle('is-open', open);
            burger.setAttribute('aria-expanded', String(open));
            burger.setAttribute('aria-label', open ? '关闭快捷面板' : '打开快捷面板');

            if (open) {
                // 面板层级高于目录，同时出现会互相穿透，故临时收起目录且不写入记录
                restoreToc = toc.classList.contains('is-open');
                if (restoreToc) {
                    setExpanded(false, false);
                }
            } else if (restoreToc) {
                setExpanded(true, false);
                restoreToc = false;
            }
        };

        burger.addEventListener('click', () => {
            setPanelOpen(!panel.classList.contains('is-open'));
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && panel.classList.contains('is-open')) {
                setPanelOpen(false);
            }
        });

        document.addEventListener('click', event => {
            if (!panel.classList.contains('is-open')) {
                return;
            }
            const target = event.target as Node;
            if (!panel.contains(target) && !burger.contains(target)) {
                setPanelOpen(false);
            }
        });

        // 窄屏时把导航项搬进面板，免得顶栏被挤爆；宽屏再搬回去
        const navSlot = el('div', 'pht-panel-nav'),
            navLinks = bar.querySelector('.pht-nav-links'),
            navHome = bar.querySelector('.pht-nav-left'),
            narrow = window.matchMedia('(max-width: 767px)');
        navSlot.hidden = true;
        if (navLinks && navHome) {
            panel.prepend(navSlot);
            const syncNav = () => {
                if (narrow.matches) {
                    navSlot.replaceChildren(navLinks);
                    navSlot.hidden = false;
                } else {
                    navHome.appendChild(navLinks);
                    navSlot.hidden = true;
                }
            };
            syncNav();
            narrow.addEventListener('change', syncNav);
        }

        // BWiki 皮肤自带的搜索框、消息铃铛与用户区搬进顶栏；找不到就维持原样
        const corners = bar.querySelector('.pht-nav-right');
        if (corners) {
            let moved = false;
            ['.nav-search-box', '.bili-game-header-nav-user', '#navNote'].forEach(selector => {
                const node = document.querySelector(selector);
                if (node) {
                    corners.appendChild(node);
                    moved = true;
                }
            });
            // 搬空了才收起皮肤原头部，避免留下一条空白；一个都没搬到就保持原样
            if (moved) {
                document.documentElement.classList.add('pht-nav-moved');
            }
        }
    };

    await init();
})();
