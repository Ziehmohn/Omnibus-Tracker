import * as cheerio from 'cheerio';
fetch('https://www.otto.de/p/egger-laminat-naturesense-el2637-belfort-eiche-silber-7mm-2-494m-praktisch-pflegeleicht-S0HCX02R/', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } }).then(r=>r.text()).then(html => {
  const $ = cheerio.load(html);
  console.log('Retail:', $('.pdp_price__retail-price').text().trim(),
              'Orig:', $('.js_pdp_price__retail-price__value_original').text().trim(),
              'Norm:', $('.pdp_price__norm-price').text().trim(),
              'Strike:', $('.pdp_price__strike-through-price').text().trim());
  console.log('HTML start:', html.substring(0, 500));
});
