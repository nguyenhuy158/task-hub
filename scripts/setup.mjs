import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd=fileURLToPath(new URL('..',import.meta.url));
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<24||(major===24&&minor<13)) throw new Error('Node.js 24.13+ required; tested with 26.7.0');
for(const [command,args] of [['pnpm',['install','--frozen-lockfile']],[process.execPath,['--import','tsx','scripts/setup-dev.ts']]]) {
  const result=spawnSync(command,args,{cwd,stdio:'inherit'});
  if(result.error) throw result.error;
  if(result.status!==0) process.exit(result.status??1);
}
