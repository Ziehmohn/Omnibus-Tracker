import fetch from 'node-fetch';
import fs from 'fs';
import * as cheerio from 'cheerio';

async function updateProductsWithRealPrices() {
  const products = JSON.parse(fs.readFileSync('all_products_v2.json', 'utf8'));
  console.log(`Checking prices for ${products.length} products...`);
  
  for (let i = 0; i < products.length; i++) {
    try {
      const p = products[i];
      const res = await fetch(p.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      const $ = cheerio.load(html);
      
      let currentPriceM2 = p.price; // fallback to json
      let strikethroughPriceM2 = null;
      
      // Look for the complex price structure using user-provided HTML
      const priceFlex1 = $('[data-testid="molecules-Price-Flex-1"]');
      
      if (priceFlex1.length > 0) {
          const delAria = priceFlex1.find('del').attr('aria-label');
          const insAria = priceFlex1.find('ins').attr('aria-label');
          
          if (delAria && insAria) {
              const delMatch = delAria.match(/[\d.]+/);
              const insMatch = insAria.match(/[\d.]+/);
              if (delMatch) strikethroughPriceM2 = parseFloat(delMatch[0]);
              if (insMatch) currentPriceM2 = parseFloat(insMatch[0]);
          } else {
              // Not discounted? Check if there's a simple price element without del/ins
              // Sometimes it's just a span or div with the aria-label
              const anyAria = priceFlex1.find('[aria-label^="EUR "]').first().attr('aria-label');
              if (anyAria) {
                  const m = anyAria.match(/[\d.]+/);
                  if (m) currentPriceM2 = parseFloat(m[0]);
              } else {
                 // Try to pull text directly
                 const text = priceFlex1.text();
                 const textMatch = text.match(/(\d+),\s*(\d+)/);
                 if (textMatch) {
                    currentPriceM2 = parseFloat(`${textMatch[1]}.${textMatch[2]}`);
                 }
              }
          }
      } else {
         // Fallback if the data-testid is missing
         const priceMatches = [...html.matchAll(/aria-label="EUR ([\d.]+)"/g)].map(m => parseFloat(m[1]));
         if (priceMatches.length === 2 && priceMatches[0] > priceMatches[1]) {
             strikethroughPriceM2 = priceMatches[0];
             currentPriceM2 = priceMatches[1];
         } else if (priceMatches.length > 0) {
             currentPriceM2 = priceMatches[0];
         }
      }
      
      if (currentPriceM2) p.price = currentPriceM2;
      if (strikethroughPriceM2) p.strikethroughPrice = strikethroughPriceM2;
      else delete p.strikethroughPrice; // Clear out if no longer discounted
      
      console.log(`[${i+1}/${products.length}] ${p.name}`);
      console.log(`  Url: ${p.url}`);
      console.log(`  Current: ${currentPriceM2}, Strikethrough: ${strikethroughPriceM2 || 'None'}`);
      
      // Delay so we don't get blocked
      await new Promise(r => setTimeout(r, 150));
    } catch(e) {
      console.error(`Failed to scrape ${products[i].url}`, e);
    }
  }
  
  fs.writeFileSync('all_products_v3.json', JSON.stringify(products, null, 2));
  console.log("Written all_products_v3.json");
}

updateProductsWithRealPrices();
