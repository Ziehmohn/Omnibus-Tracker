import * as cheerio from 'cheerio';
async function test() {
  const url = 'https://api.allorigins.win/get?url=' + encodeURIComponent('https://www.otto.de/p/egger-laminat-naturesense-el1030-buche-sb-rustikal-7mm-2-494m-praktisch-pflegeleicht-S0HCX01E/');
  const res = await fetch(url);
  console.log("status:", res.status);
  const data = await res.json();
  const html = data.contents;
  const $ = cheerio.load(html);
  console.log("retail:", $('.pdp_price__retail-price').text().trim());
  console.log("title:", $('title').text().trim());
  console.log("html length:", html.length);
  console.log("norm:", $('.pdp_price__norm-price').text().trim());
  console.log("strike:", $('.pdp_price__strike-through-price').text().trim());
  console.log("sale-tag:", $('oc-tag-v1[variant="sale"]').text().trim());
}
test();
