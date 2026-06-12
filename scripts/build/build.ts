import { rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, relative, dirname, basename } from 'node:path';
import { transformFile } from '@swc/core';
import browserslist from 'browserslist';
import FastGlob from 'fast-glob';
import { transform, browserslistToTargets } from 'lightningcss';
import { banner } from '@/config';
import { generateDefinition } from './definition';

const SRC_DIR = resolve('src');
const DIST_DIR = resolve('dist');

type FileProcessor = (file: string) => Promise<Uint8Array | string>;

const transpileJs: FileProcessor = async file => {
    const { code } = await transformFile(file);
    return code;
};

const transpileTs: FileProcessor = async file => {
    const { code } = await transformFile(file, {
        jsc: {
            parser: {
                syntax: 'typescript',
            },
        },
    });
    return code;
};

const transpileCss: FileProcessor = async file => {
    const source = await readFile(file);
    const { code } = transform({
        filename: file,
        code: Buffer.from(source),
        minify: true,
        sourceMap: false,
        targets: browserslistToTargets(browserslist()),
    });
    return code;
};

const wrapCode = (code: Uint8Array | string): Uint8Array => {
    const encoder = new TextEncoder();

    const prefix = encoder.encode(`${banner}\n\n/* <nowiki> */\n\n`),
        suffix = encoder.encode('\n\n/* </nowiki> */');

    const body = typeof code === 'string' ? encoder.encode(code) : code;

    return new Uint8Array([...prefix, ...body, ...suffix]);
};

const processFiles = async (
    pattern: string,
    subDir: string,
    processor: FileProcessor,
    filter?: (file: string) => boolean,
    outExt?: string,
) => {
    const files = await FastGlob(pattern, { cwd: SRC_DIR, absolute: true });

    await Promise.all(
        files
            .filter(file => !filter || filter(file))
            .map(async file => {
                const relPath = relative(resolve(SRC_DIR, subDir), file);
                let outFile = resolve(DIST_DIR, subDir, relPath);
                if (outExt) {
                    outFile = outFile.replace(/\.[^.]+$/, outExt);
                }
                const code = wrapCode(await processor(file));
                await mkdir(dirname(outFile), { recursive: true });
                await writeFile(outFile, code);
            }),
    );
};

const isGadgetEntryFile = (file: string) => {
    const name = basename(file);
    return /^Gadget-.*\.(js|ts|css)$/.test(name);
};

const buildWidgets = async () => {
    const dirs = await FastGlob('widgets/*', {
        cwd: SRC_DIR,
        absolute: true,
        onlyDirectories: true,
    });

    await mkdir(resolve(DIST_DIR, 'widgets'), { recursive: true });

    await Promise.all(
        dirs.map(async dir => {
            const name = basename(dir);
            const entryName = `Widget-${name}`;
            const varName = `wg${name}`;

            let output = '';

            try {
                const desc = await readFile(resolve(dir, 'description.wiki'), 'utf-8');
                output += `<noinclude>${desc.trimEnd()}</noinclude>`;
            } catch {
                /* optional */
            }

            let inner = '';

            const cssFile = resolve(dir, `${entryName}.css`);
            try {
                const source = await readFile(cssFile);
                const { code } = transform({
                    filename: cssFile,
                    code: Buffer.from(source),
                    minify: true,
                    sourceMap: false,
                });
                inner += `<styles>\n${String(code)}\n</styles>`;
            } catch {
                /* optional */
            }

            let jsCode: string | null = null;
            try {
                const { code } = await transformFile(resolve(dir, `${entryName}.ts`));
                jsCode = code;
            } catch {
                try {
                    const { code } = await transformFile(resolve(dir, `${entryName}.js`));
                    jsCode = code;
                } catch {
                    /* optional */
                }
            }
            if (jsCode) {
                inner += `<scripts>\n${jsCode.trimEnd()}\n</scripts>`;
            }

            if (!inner) {
                return;
            }

            output += `<includeonly><!--{if !isset($${varName}) || !$${varName}}--><!--{assign var="${varName}" value=true scope="global"}-->${inner}<!--{/if}--></includeonly>`;

            await writeFile(resolve(DIST_DIR, 'widgets', name), output, 'utf-8');
        }),
    );
};

const build = async () => {
    await rm(DIST_DIR, { recursive: true, force: true });
    await mkdir(resolve(DIST_DIR, 'gadgets'), { recursive: true });

    await writeFile(`${DIST_DIR}/gadgets/Gadgets-definition`, await generateDefinition());

    await Promise.all([
        processFiles('gadgets/*/*.js', 'gadgets', transpileJs, isGadgetEntryFile),
        processFiles('gadgets/*/*.ts', 'gadgets', transpileTs, isGadgetEntryFile, '.js'),
        processFiles('gadgets/*/*.css', 'gadgets', transpileCss, isGadgetEntryFile),
        processFiles('global/*.js', 'global', transpileJs),
        processFiles('global/*.ts', 'global', transpileTs, undefined, '.js'),
        processFiles('global/*.css', 'global', transpileCss),
        buildWidgets(),
    ]);
};

export { build };
