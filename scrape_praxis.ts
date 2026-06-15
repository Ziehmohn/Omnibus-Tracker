import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, writeBatch, serverTimestamp, Timestamp, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';
import * as cheerio from 'cheerio';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function runPraxis() {
  const itemsRef = collection(db, "items");
  const q = query(itemsRef, where("marketplace", "==", "Praxis"));
  const querySnapshot = await getDocs(q);

  const date = new Date();
  const yyyy = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const ddStr = String(date.getDate()).padStart(2, '0');
  const dateString = `${yyyy}${mo}${ddStr}`;
  const tsDate = Timestamp.fromMillis(date.getTime());

  let count = 0;

  // We chunk the scraping to not overwhelm the API and our memory
  const docs = querySnapshot.docs.slice();
  const CONCURRENCY = 10;
  
  for (let i = 0; i < docs.length; i += CONCURRENCY) {
    const chunk = docs.slice(i, i + CONCURRENCY);
    
    await Promise.all(chunk.map(async (docSnap) => {
      const itemData = docSnap.data();
      const itemId = docSnap.id;
      const url = itemData.url;

      if (!url) return;
      console.log(`Scraping Praxis: ${url}`);
      
      let html = "";
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          }
        });
        if (res.ok) html = await res.text();
      } catch(e) { 
        console.error(`Failed to fetch ${url}`);
      }

      let latestPrice: number | null = null;
      let latestStrike: number | null = itemData.strikethroughPrice || null;

      if (html !== "") {
        const $ = cheerio.load(html);

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
      }

      if (latestPrice === null) {
        console.log(`Could not find price for ${url}, skipping or using previous...`);
        return;
      }

      if (!latestStrike && itemData.basePricePack) {
          latestStrike = itemData.basePricePack;
      }

      let discountPercentage = null;
      if (latestPrice && latestStrike && latestStrike > latestPrice) {
          discountPercentage = Math.round((1 - (latestPrice / latestStrike)) * 100);
      }

      // Calculate Omnibus Violation
      let isViolation = false;
      if (latestStrike && latestStrike > latestPrice) {
        // Fetch last 30 days of price records
        const thirtyDaysAgo = new Date(date);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoTs = Timestamp.fromMillis(thirtyDaysAgo.getTime());
        
        const historyRef = collection(db, `items/${itemId}/priceRecords`);
        const historyQuery = query(historyRef, where("date", ">=", thirtyDaysAgoTs));
        const historySnap = await getDocs(historyQuery);
        
        let lowestRecentPrice = latestStrike; // assume compliant until proven otherwise
        for (const historyDoc of historySnap.docs) {
           const historyData = historyDoc.data();
           const pastPrice = historyData.currentPrice;
           if (pastPrice !== null && pastPrice < lowestRecentPrice) {
               lowestRecentPrice = pastPrice;
           }
        }
        
        // If the strikethrough price (reference price) is higher than the lowest price in the last 30 days
        if (latestStrike > lowestRecentPrice) {
            isViolation = true;
        }
      }

      const batch = writeBatch(db);
      const hRef = doc(db, `items/${itemId}/priceRecords`, dateString);
      batch.set(hRef, {
        currentPrice: latestPrice,
        strikethroughPrice: latestStrike,
        discountPercentage: discountPercentage,
        discountStartDate: null,
        date: tsDate,
        itemId: itemId,
        isViolation: isViolation 
      }, { merge: true });
      
      batch.update(docSnap.ref, {
        latestPrice: latestPrice,
        strikethroughPrice: latestStrike,
        lastUpdated: new Date().toISOString()
      });

      await batch.commit();
      count++;
    }));
  }

  console.log(`Updated ${count} PRAXIS items for today.`);
}

runPraxis().catch(console.error);

