import process from 'node:process';
import { Octokit } from 'octokit';

const OWNER = 'Saoutax';
const REPO = 'The-Piper-of-Dawn-InterfaceCodes';
const FILE_PATH = 'src/gadgets/libDiff/Gadget-libDiff.js';
const MAIN_BRANCH = 'main';

const updateDiff = async () => {
    const token = process.env['GITHUB_TOKEN'];
    if (!token) {
        console.error('❌ GITHUB_TOKEN environment variable is not set');
        process.exit(1);
    }

    const octokit = new Octokit({ auth: token });

    console.log('🔍 Fetching latest diff version from npm registry...');
    const registryRes = await fetch('https://registry.npmjs.org/diff/latest');
    if (!registryRes.ok) {
        console.error(`❌ Failed to fetch npm registry: ${registryRes.status}`);
        process.exit(1);
    }
    const { version: latestVersion } = (await registryRes.json()) as { version: string };
    console.log(`   Latest version: v${latestVersion}`);

    console.log('📂 Checking current file on main branch...');
    let currentSha: string | undefined;
    let currentContent: string | undefined;

    try {
        const { data: fileData } = await octokit.rest.repos.getContent({
            owner: OWNER,
            repo: REPO,
            path: FILE_PATH,
            ref: MAIN_BRANCH,
        });

        if (!Array.isArray(fileData) && 'content' in fileData && fileData.content) {
            currentSha = fileData.sha;
            currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
            console.log(`   Current file exists, SHA: ${currentSha!.slice(0, 7)}`);
        }
    } catch (error: unknown) {
        const octoError = error as { status?: number };
        if (octoError.status !== 404) {
            throw error;
        }
        console.log('   File does not exist on main branch yet, will create new file.');
    }

    const cdnUrl = `https://cdn.jsdelivr.net/npm/diff@${latestVersion}/dist/diff.min.js`;
    console.log(`⬇️  Fetching CDN content: ${cdnUrl}`);
    const cdnRes = await fetch(cdnUrl);
    if (!cdnRes.ok) {
        console.error(`❌ Failed to fetch CDN content: ${cdnRes.status}`);
        process.exit(1);
    }
    const cdnContent = await cdnRes.text();
    console.log(`   CDN content fetched: ${(cdnContent.length / 1024).toFixed(1)} KB`);

    if (currentContent !== undefined && currentContent === cdnContent) {
        console.log('✅ Content is already up-to-date. No commit needed.');
        return;
    }

    console.log('📝 Writing file...');
    await octokit.rest.repos.createOrUpdateFileContents({
        owner: OWNER,
        repo: REPO,
        path: FILE_PATH,
        message: `chore: update diff library to v${latestVersion}`,
        content: Buffer.from(cdnContent).toString('base64'),
        branch: MAIN_BRANCH,
        ...(currentSha ? { sha: currentSha } : {}),
    });
    console.log(`✅ File updated to v${latestVersion} (${(cdnContent.length / 1024).toFixed(1)} KB)`);
};

export { updateDiff };
