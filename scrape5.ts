import fetch from 'node-fetch';
import fs from 'fs';

async function run() {
  const products = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://www.praxis.nl/search?text=yarenza&currentPage=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    
    const matches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs);
    for (const match of matches) {
      if (match[1].includes('"@type":"Product"')) {
        try {
          const data = JSON.parse(match[1]);
          if (data.name && data.name.toLowerCase().includes('yarenza')) {
            let m2Price = data.offers.price;
            if (data.offers.eligibleQuantity && data.offers.eligibleQuantity.value) {
              m2Price = data.offers.price / data.offers.eligibleQuantity.value;
            }
            
            // Generate URL if missing
            let url = data.url;
            if (!url && data.offers && data.offers.url) url = `https://www.praxis.nl${data.offers.url}`;
            if (!url) {
                const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                url = `https://www.praxis.nl/verf-laminaat-decoratie/vloeren/laminaat/${slug}/${data.sku}`;
            }

            products.push({
              name: data.name,
              sku: data.sku,
              basePricePack: data.offers.price, // Will use for reference
              price: parseFloat(m2Price.toFixed(2)),
              url: url
            });
          }
        } catch(e) {}
      }
    }
  }
  
  const uniqueProducts = Array.from(new Map(products.map(p => [p.sku, p])).values());
  fs.writeFileSync('all_products_v2.json', JSON.stringify(uniqueProducts, null, 2));
  console.log("Scraped", uniqueProducts.length, "unique products.");
}
run();
