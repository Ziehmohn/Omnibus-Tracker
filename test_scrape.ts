import * as cheerio from 'cheerio';
async function test() {
  const url = 'https://www.otto.de/p/egger-laminat-naturesense-el1030-buche-sb-rustikal-7mm-2-494m-praktisch-pflegeleicht-S0HCX01E/';
  const res = await fetch(url, { headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'de,en-US;q=0.7,en;q=0.3'
  }});
  console.log("status:", res.status);
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log("retail:", $('.pdp_price__retail-price').text().trim());
  console.log("title:", $('title').text().trim());
  console.log("html length:", html);
  console.log("norm:", $('.pdp_price__norm-price').text().trim());
  console.log("strike:", $('.pdp_price__strike-through-price').text().trim());
  console.log("sale-tag:", $('oc-tag-v1[variant="sale"]').text().trim());
}
test();
