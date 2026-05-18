import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, writeBatch, serverTimestamp, Timestamp, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const content = fs.readFileSync('otto_products.csv', 'utf8');
  const lines = content.trim().split('\n').slice(1);
  
  let batch = writeBatch(db);
  let count = 0;
  
  let index = 1000; // start indexing id
  const trackingStartDate = new Date('2026-05-08T12:00:00Z');

  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Produktset;Kategorie;Marketplace;SKU;EAN;Produktreferenz;Produktdetailseite-URL;Angebot gültig seit
    const parts = line.split(';');
    if (parts.length < 7) continue;

    const productset = parts[0].trim();
    const kategorie = parts[1].trim();
    const marketplace = parts[2].trim();
    const sku = parts[3].trim();
    const ean = parts[4].trim();
    const produktreferenz = parts[5].trim();
    const url = parts[6].trim();
    const gueltigStr = parts[7] ? parts[7].trim() : null;

    const itemId = `otto-item-${index++}`;
    const itemRef = doc(collection(db, "items"), itemId);

    batch.set(itemRef, {
      name: `Egger ${kategorie} ${produktreferenz}`,
      sku: sku,
      ean: ean,
      url: url,
      marketplace: marketplace,
      productset: productset,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    count++;

    // Simulated prices to have something on the dashboard
    // Base price
    const basePrice = Math.round((Math.random() * 15 + 15) * 100) / 100; 
    let sp = Math.random() > 0.5 ? Math.round((basePrice * 1.3) * 100) / 100 : null; // strikethrough
    let dp = sp ? Math.round((1 - (basePrice / sp)) * 100) : null;
    
    // Parse valid date if available
    let sd: Date | null = null;
    if (gueltigStr) {
      const [dd, mm, yy] = gueltigStr.split('.');
      if (dd && mm && yy) {
        sd = new Date(`${yy}-${mm}-${dd}T12:00:00Z`);
      }
    }

    for (let day = 0; day <= 4; day++) {
      const date = new Date(trackingStartDate);
      date.setDate(date.getDate() + day);

      const yyyy = date.getFullYear();
      const mo = String(date.getMonth() + 1).padStart(2, '0');
      const ddStr = String(date.getDate()).padStart(2, '0');
      const dateString = `${yyyy}${mo}${ddStr}`;

      const hRef = doc(db, `items/${itemId}/priceRecords`, dateString);

      let tsDiscountStartDate = sd ? Timestamp.fromMillis(sd.getTime()) : null;
      let tsDate = Timestamp.fromMillis(date.getTime());

      batch.set(hRef, {
        currentPrice: basePrice,
        strikethroughPrice: sp,
        discountPercentage: dp,
        discountStartDate: tsDiscountStartDate,
        date: tsDate,
        itemId: itemId,
        isViolation: false
      });
      count++;
    }

    if (count > 400) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
      console.log("Committed batch");
    }
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log("Done importing OTTO products!");
  process.exit(0);
}

run().catch(console.error);
