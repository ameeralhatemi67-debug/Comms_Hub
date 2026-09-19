const path = require('node:path');
const os = require('node:os');
function dependency(name) {
  try { return require(name); } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    const modules = process.env.CODEX_NODE_MODULES || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
    try { return require(path.join(modules, name)); } catch {
      throw Error(`Install ${name} locally or set CODEX_NODE_MODULES to a directory containing it.`);
    }
  }
}
module.exports = {dependency, baseURL:process.env.QA_BASE_URL || 'http://127.0.0.1:3000', launchOptions:{headless:true,...(process.env.QA_BROWSER==='chromium'?{}:{channel:process.env.QA_BROWSER||'msedge'})}};
