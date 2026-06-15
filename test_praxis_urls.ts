import * as cheerio from 'cheerio';
async function test() {
  const url = 'https://www.praxis.nl/tegels-vloeren/pvc-vloeren/pvc-planken/yarenza-altessa-rechte-plank-smoky-plak-pvc/10670095';
  const res = await fetch(url, { headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html',
  }});
  const html = await res.text();
  const $ = cheerio.load(html);
  
  let latestPrice = null;
  let latestStrike = null;

  // 1. Try to extract from LD-JSON First
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).html();
    if (text && text.includes('"priceCurrency":"EUR"')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.offers && typeof parsed.offers.price === 'number') {
           latestPrice = parsed.offers.price;
        } else if (parsed.offers && parsed.offers.length > 0 && typeof parsed.offers[0].price === 'number') {
           latestPrice = parsed.offers[0].price;
        }
      } catch(e) {}
    }
  });

  // 2. Try to extract strikethrough price from <del> tag
  const delLabels = $('del').map((_, el) => $(el).attr('aria-label')).get();
  for (const label of delLabels) {
     if (label && label.startsWith('EUR ')) {
        const parsed = parseFloat(label.replace('EUR ', '').trim());
        if (!isNaN(parsed) && parsed > 0) {
           latestStrike = parsed;
           break;
        }
     }
  }

  // 3. If latestPrice wasn't found in LD-JSON, try from <ins> tag
  if (latestPrice === null) {
      const insLabels = $('ins').map((_, el) => $(el).attr('aria-label')).get();
      for (const label of insLabels) {
         if (label && label.startsWith('EUR ')) {
            const parsed = parseFloat(label.replace('EUR ', '').trim());
            if (!isNaN(parsed) && parsed > 0) {
               latestPrice = parsed;
               break;
            }
         }
      }
  }
  
  // 4. Try from any tag with data-testid="val-sub"
  if (latestPrice === null) {
      const subLabels = $('[data-testid="val-sub"]').map((_, el) => $(el).attr('aria-label')).get();
      for (const label of subLabels) {
         if (label && label.startsWith('EUR ')) {
            const parsed = parseFloat(label.replace('EUR ', '').trim());
            if (!isNaN(parsed) && parsed > 0) {
               latestPrice = parsed;
               break;
            }
         }
      }
  }

  // 5. Old fallback regex
  if (latestPrice === null) {
    const match = html.match(/"price"\s*:\s*([\d.]+)/);
    if (match && match[1]) latestPrice = parseFloat(match[1]);
  }

  console.log("Extracted Price:", latestPrice);
  console.log("Extracted Strike:", latestStrike);
}
test();
