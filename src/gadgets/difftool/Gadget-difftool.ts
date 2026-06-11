(async () => {
    const diffTable = document.querySelector<HTMLTableElement>('table.diff');
    if (!diffTable) {
        return;
    }

    const applyDiff = (JsDiff: typeof window.Diff) => {
        for (const row of Array.from(diffTable.rows)) {
            const cells = Array.from(row.cells);
            let leftCell: HTMLTableCellElement | undefined, rightCell: HTMLTableCellElement | undefined;

            if (cells.length === 4) {
                leftCell = cells[1];
                rightCell = cells[3];
            } else if (cells.length === 3) {
                if (cells[2]!.colSpan === 2) {
                    leftCell = cells[1];
                } else if (cells[0]!.colSpan === 2) {
                    rightCell = cells[2];
                }
            } else {
                continue;
            }

            const leftText = leftCell?.textContent ?? '',
                rightText = rightCell?.textContent ?? '';
            if (!leftText && !rightText) {
                continue;
            }

            const parts = JsDiff.diffChars(leftText, rightText);

            const render = (cell: HTMLTableCellElement | undefined, isLeft: boolean) => {
                if (!cell) {
                    return;
                }

                const div = document.createElement('div');

                parts.forEach(part => {
                    if ((isLeft && part.added) || (!isLeft && part.removed)) {
                        return;
                    }

                    const changed = isLeft ? part.removed : part.added;

                    if (changed) {
                        const tag = isLeft ? 'del' : 'ins';
                        const el = document.createElement(tag);
                        el.className = 'diffchange diffchange-inline';
                        el.appendChild(document.createTextNode(part.value));
                        div.appendChild(el);
                    } else {
                        div.appendChild(document.createTextNode(part.value));
                    }
                });

                cell.innerHTML = '';
                cell.appendChild(div);
            };

            render(leftCell, true);
            render(rightCell, false);
        }
    };

    try {
        applyDiff(window.Diff);
        console.debug('difftool loaded.');
    } catch (error) {
        console.error(`加载JsDiff时发生错误：${String(error)}`);
    }
})();
