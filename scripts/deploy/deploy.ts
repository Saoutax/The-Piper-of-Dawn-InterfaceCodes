import { Mwn } from 'mwn';
import { SESSDATA, apiUrl, userAgent } from '.././config';
import { contentHash, needDeploy } from './utils';
import 'dotenv/config';

const deploy = async (message: string, author: string) => {
    const bot = new Mwn({
        apiUrl,
        userAgent,
        maxRetries: 20,
    });

    void bot.cookieJar.setCookie(`SESSDATA=${SESSDATA}`, apiUrl);

    const oldDeploymentJson = async (): Promise<Record<string, string> | Record<string, never>> => {
        const data = await bot.read('MediaWiki:Deployment.json', {
            rvprop: ['content'],
        });
        const content = 'missing' in data ? '' : (data.revisions?.[0]?.content ?? '');
        return content ? JSON.parse(content) : {};
    };

    const oldDeploy = await oldDeploymentJson(),
        currentDeploy = await contentHash(),
        deployment = needDeploy(oldDeploy, currentDeploy);

    const summary = `Git commit${message ? `: ${message}, authored by ${author}` : ''}`;
    await bot.batchOperation(Object.entries(deployment), async ([title, content]) =>
        bot.save(title, content, summary, { bot: true, tags: 'Bot' }),
    );
    await bot.save(
        'MediaWiki:Deployment.json',
        JSON.stringify(Object.fromEntries(Object.entries(currentDeploy).map(([key, { hash }]) => [key, hash]))),
        summary,
        {
            bot: true,
            tags: 'Bot',
        },
    );
};

export { deploy };
