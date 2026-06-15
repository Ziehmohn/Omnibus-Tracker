import fs from 'fs';
const content = fs.readFileSync('src/services/seedService.ts', 'utf8');
const i1 = content.indexOf('Yarenza Corvina');
console.log(content.substring(i1 - 200, i1 + 500));
