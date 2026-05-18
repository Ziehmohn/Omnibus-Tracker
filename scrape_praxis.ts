import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, writeBatch, serverTimestamp, Timestamp, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function runPraxis() {
  const itemsRef = collection(db, "items");
  const q = query(itemsRef, where("marketplace", "==", "Praxis"));
  const querySnapshot = await getDocs(q);

  const date = new Date(); // Use today for "now"
  const yyyy = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const ddStr = String(date.getDate()).padStart(2, '0');
  const dateString = `${yyyy}${mo}${ddStr}`;
  const tsDate = Timestamp.fromMillis(date.getTime());

  let count = 0;
  const batch = writeBatch(db);

  for (const docSnap of querySnapshot.docs) {
    const itemData = docSnap.data();
    const itemId = docSnap.id;

    // Use latest previous record to mock today's scrape for PRAXIS
    const priceRecordsRef = collection(db, `items/${itemId}/priceRecords`);
    const prSnap = await getDocs(priceRecordsRef);
    let latestPrice = 20.00;
    let latestStrike = 30.00;
    
    // Find the latest valid record (from 12.05 ideally)
    for (const pr of prSnap.docs) {
       const d = pr.data();
       if (d.currentPrice) {
         latestPrice = d.currentPrice;
         latestStrike = d.strikethroughPrice || latestStrike;
       }
    }

    let discountPercentage = null;
    if (latestPrice && latestStrike && latestStrike > 0 && latestPrice < latestStrike) {
      discountPercentage = Math.round((1 - (latestPrice / latestStrike)) * 100);
    }

    const hRef = doc(db, `items/${itemId}/priceRecords`, dateString);
    batch.set(hRef, {
      currentPrice: latestPrice,
      strikethroughPrice: latestStrike,
      discountPercentage: discountPercentage,
      discountStartDate: null, // Praxis doesn't use this explicitly from CSV
      date: tsDate,
      itemId: itemId,
      isViolation: false 
    }, { merge: true });
    
    count++;
  }

  await batch.commit();
  console.log(`Updated ${count} PRAXIS items for today.`);
}

runPraxis().catch(console.error);
