import 'dotenv/config';

/* 下方内容无需修改 */
const env = process.env;
const SESSDATA = env['SESSDATA']!;
const userAgent = env['USERAGENT']!;
/* 上方内容无需修改 */

/* ！！！请修改下方内容！！！ */

const apiUrl = 'https://wiki.biligame.com/pod/api.php';

const banner = `/**
 * ------------------------------------------------------
 * !!!                      请勿手动修改本页面内容，否则你的编辑将被覆盖                 !!!
 * !!!       DON'T MODIFY THIS PAGE MANUALLY, YOUR CHANGES WILL BE OVERWRITTEN       !!!
 * !!!  Repository URL: https://github.com/Saoutax/The-Piper-of-Dawn-InterfaceCodes  !!!
 * ------------------------------------------------------
 */`; // 脚本上方提示，需为 JavaScript 与 CSS 均接受的注释格式

export { SESSDATA, userAgent, apiUrl, banner };
