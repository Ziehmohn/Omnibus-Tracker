import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, writeBatch, serverTimestamp, Timestamp, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';
import * as cheerio from 'cheerio';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const parseCurrencyString = (str: string) => {
  if (!str) return null;
  const match = str.match(/[\d,.]+/);
  if (match) {
    let clean = match[0].replace(/\./g, '').replace(',', '.');
    return parseFloat(clean);
  }
  return null;
}

async function run() {
  // Load CSV to get "Gültig seit" dates
  const csvContent = fs.readFileSync('otto_products.csv', 'utf8');
  const lines = csvContent.trim().split('\n').slice(1);
  const csvDatesByUrl = new Map<string, Timestamp>();

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(';');
    if (parts.length >= 7) {
      const url = parts[6].trim();
      const gueltigStr = parts[7] ? parts[7].trim() : null;
      if (gueltigStr) {
        const [dd, mm, yy] = gueltigStr.split('.');
        if (dd && mm && yy) {
          const date = new Date(`${yy}-${mm}-${dd}T12:00:00Z`);
          csvDatesByUrl.set(url, Timestamp.fromMillis(date.getTime()));
        }
      }
    }
  }

  const itemsRef = collection(db, "items");
  const q = query(itemsRef, where("marketplace", "==", "OTTO"));
  const querySnapshot = await getDocs(q);

  let updatedCount = 0;

  for (const docSnap of querySnapshot.docs) {
    const itemData = docSnap.data();
    const itemId = docSnap.id;
    const url = itemData.url;

    if (!url) continue;

    console.log(`Scraping ${url}`);
    try {
      let html = "";
      let res;
      try {
        res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'de,en-US;q=0.7,en;q=0.3'
          }
        });
        if (res.ok) {
          html = await res.text();
        }
      } catch(e) { }

      const $ = cheerio.load(html);

      // Select prices without assuming js_ class is present. Often it's just the text inside the whole block
      let currentPriceStr = $('.pdp_price__retail-price').text().trim() || $('.js_pdp_price__retail-price__value_original').text().trim();
      let currentPricePackage = parseCurrencyString(currentPriceStr);

      let strikethroughPriceStr = $('.pdp_price__strike-through-price').text().trim();
      let strikethroughPricePackage = parseCurrencyString(strikethroughPriceStr);

      let normPriceStr = $('.pdp_price__norm-price').text().trim();
      let currentPriceQM = parseCurrencyString(normPriceStr);

      let currentPrice = currentPricePackage;
      let strikethroughPrice = strikethroughPricePackage;

      if (currentPriceQM !== null) {
        currentPrice = currentPriceQM;
        if (strikethroughPricePackage !== null && currentPricePackage !== null && currentPricePackage > 0) {
           strikethroughPrice = currentPriceQM * (strikethroughPricePackage / currentPricePackage);
           // Round to 2 decimals
           strikethroughPrice = Math.round(strikethroughPrice * 100) / 100;
        } else {
           strikethroughPrice = null;
        }
      }

      if (currentPrice === null) {
        console.log(`Failed to extract price for ${url}. Bypassing due to missing data or bot protection.`);
        continue;
      }

      let discountPercentage = null;
      if (currentPrice !== null && strikethroughPrice !== null && strikethroughPrice > 0) {
        discountPercentage = Math.round((1 - (currentPrice / strikethroughPrice)) * 100);
      }

      const discountStartDate = csvDatesByUrl.get(url) || null;

      const date = new Date(); // Use today for "now"
      const yyyy = date.getFullYear();
      const mo = String(date.getMonth() + 1).padStart(2, '0');
      const ddStr = String(date.getDate()).padStart(2, '0');
      const dateString = `${yyyy}${mo}${ddStr}`;
      
      const tsDate = Timestamp.fromMillis(date.getTime());

      // Create batched write
      const batch = writeBatch(db);
      const hRef = doc(db, `items/${itemId}/priceRecords`, dateString);

      // delete any old records we created recently if needed by using the batch ?
      // Wait we overwrite today's record. Let's just create today's record
      
      batch.set(hRef, {
        currentPrice: currentPrice,
        strikethroughPrice: strikethroughPrice || null,
        discountPercentage: discountPercentage,
        discountStartDate: discountStartDate,
        date: tsDate,
        itemId: itemId,
        isViolation: false // Assume false, logic runs elsewhere usually
      }, { merge: true });

      await batch.commit();
      updatedCount++;
      console.log(`Updated ${itemId}: CP=${currentPrice}, SP=${strikethroughPrice}, DP=${discountPercentage}`);
      
      // Be nice to the server
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`Error scraping ${url}:`, e);
    }
  }

  console.log(`Done scraping OTTO. Updated ${updatedCount} items.`);
}

run().catch(console.error);
