import * as cheerio from 'cheerio';
async function test() {
  const url = 'https://www.praxis.nl/verf-laminaat-decoratie/vloeren/laminaat/yarenza-armonia-large-sorento-8mm-extra-breed-laminaat/10512173';
  const res = await fetch(url, { headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'nl,en-US;q=0.7,en;q=0.3'
  }});
  const html = await res.text();
  const $ = cheerio.load(html);
  
  $('script[type="application/ld+json"]').each((i, el) => {
        const text = $(el).html();
        if (text && text.includes('"priceCurrency":"EUR"')) {
           const parsed = JSON.parse(text);
           console.log(parsed.offers.price);
        }
  });

}
test();





