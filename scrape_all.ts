import fs from 'fs';

async function run() {
  const products = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://www.praxis.nl/search?text=yarenza&currentPage=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    
    // Find all <script type="application/ld+json"> ... </script>
    const matches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs);
    for (const match of matches) {
      if (match[1].includes('"@type":"Product"')) {
        try {
          const data = JSON.parse(match[1]);
          if (data.name && data.name.toLowerCase().includes('yarenza')) {
            products.push({
              name: data.name,
              sku: data.sku,
              price: data.offers.price,
              url: data.url || `https://www.praxis.nl${data.offers.url || ''}`
            });
          }
        } catch(e) {}
      }
    }
  }
  
  // Deduplicate products based on sku
  const uniqueProducts = Array.from(new Map(products.map(p => [p.sku, p])).values());
  fs.writeFileSync('all_products.json', JSON.stringify(uniqueProducts, null, 2));
  console.log("Scraped", uniqueProducts.length, "unique products.");
}
run();
