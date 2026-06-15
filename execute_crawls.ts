import { execSync } from 'child_process';
console.log("Running OTTO");
try { console.log(execSync('npx tsx scrape_otto.ts', {encoding: 'utf8'})); } catch(e) { console.error(e.stdout); console.error(e.stderr); }
console.log("Running Praxis");
try { console.log(execSync('npx tsx scrape_praxis.ts', {encoding: 'utf8'})); } catch(e) { console.error(e.stdout); console.error(e.stderr); }
