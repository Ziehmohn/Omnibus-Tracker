import * as cheerio from 'cheerio';

async function test() {
  const url = 'https://www.otto.de/p/egger-laminat-naturesense-el1030-buche-sb-rustikal-7mm-2-494m-praktisch-pflegeleicht-S0HCX01E/';
  const r = await fetch(url);
  const html = await r.text();
  const $ = cheerio.load(html);
  
  console.log('Retail:', $('.pdp_price__retail-price').text().trim());
  console.log('Strikethrough text:', $('.pdp_price__strike-through-price').text().trim());
  console.log('Discount:', $('.pdp_price__discount-label').text().trim());
}

test().catch(console.error);
