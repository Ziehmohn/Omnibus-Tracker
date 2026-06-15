import fs from 'fs';
const lines = fs.readFileSync('src/services/seedService.ts', 'utf8').split('\n');
const praxis = lines.filter(l => l.includes('Praxis')).slice(0, 10);
console.log(praxis);
const yarenza = lines.filter(l => l.includes('Yarenza'));
console.log(yarenza);
