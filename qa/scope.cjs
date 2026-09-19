const fs=require('node:fs'),path=require('node:path');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)])}
const inspected=[...files('src'),'package.json','postcss.config.mjs','tsconfig.json'];
const patterns={privateKey:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,credential:/\b(?:sk-proj-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16})\b/,serviceURL:/(?:postgres(?:ql)?:\/\/|https:\/\/[^\s"']*(?:supabase\.co|api\.openai\.com|graph\.facebook\.com))/,externalClient:/\b(?:fetch\s*\(|new WebSocket|createClient\s*\(|BullMQ|ioredis|PrismaClient)/};
const findings=[];for(const file of inspected){const text=fs.readFileSync(file,'utf8');for(const [kind,re]of Object.entries(patterns))if(re.test(text))findings.push({file,kind})}
const configs=fs.readdirSync('.').filter(n=>/^\.env(?:\.|$)|^vercel\.json$|^supabase$|^docker-compose/.test(n));
const report={inspectedFiles:inspected.length,findings,productionConfigurationCandidates:configs,note:'Focused source/configuration scan; excludes architecture documents and dependencies. No secret values are logged.'};fs.writeFileSync('qa/scope.json',JSON.stringify(report,null,2));console.log(report);if(findings.length||configs.length)process.exitCode=1;
