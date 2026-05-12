import fetch from 'node-fetch';

async function test() {
  const url = 'https://www.praxis.nl/verf-laminaat-decoratie/vloeren/laminaat/yarenza-corvina-molette-ultra-mat-waterbestendig-7-5mm-laminaat/10512171';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  console.log("HTML length:", html.length);
  
  const priceMatches = html.match(/aria-label="EUR [0-9.]+"/g);
  console.log("Price matches by aria-label:", priceMatches);
  
  const nextDataMatches = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
  if (nextDataMatches) {
    console.log("Found Next.js data");
  }
}
test();
