import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, writeBatch, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function fixViolations() {
  const itemsRef = collection(db, "items");
  const itemsSnap = await getDocs(itemsRef);

  let updatedCount = 0;

  for (const itemDoc of itemsSnap.docs) {
    const itemId = itemDoc.id;
    const historyRef = collection(db, `items/${itemId}/priceRecords`);
    const historySnap = await getDocs(query(historyRef, orderBy("date", "asc")));
    
    // Sort array in memory just to be safe
    const records = historySnap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() }));
    records.sort((a, b) => {
        const da = a.data.date?.toMillis ? a.data.date.toMillis() : (a.data.date?.seconds * 1000 || 0);
        const db = b.data.date?.toMillis ? b.data.date.toMillis() : (b.data.date?.seconds * 1000 || 0);
        return da - db;
    });

    const batch = writeBatch(db);
    let batchHasOperations = false;

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const dateTs = record.data.date?.toMillis ? record.data.date.toMillis() : (record.data.date?.seconds * 1000);
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        
        let lowestPriceInLast30Days = record.data.strikethroughPrice;
        
        // Find lowest price in the preceding 30 days
        for (let j = 0; j < i; j++) {
            const pastRecord = records[j];
            const pastDateTs = pastRecord.data.date?.toMillis ? pastRecord.data.date.toMillis() : (pastRecord.data.date?.seconds * 1000);
            if (dateTs - pastDateTs <= thirtyDaysMs) {
                if (pastRecord.data.currentPrice !== null && pastRecord.data.currentPrice < lowestPriceInLast30Days) {
                    lowestPriceInLast30Days = pastRecord.data.currentPrice;
                }
            }
        }

        let isViolation = false;
        if (record.data.strikethroughPrice && record.data.strikethroughPrice > record.data.currentPrice) {
            if (record.data.strikethroughPrice > lowestPriceInLast30Days) {
                isViolation = true;
            }
        }

        if (record.data.isViolation !== isViolation || typeof record.data.isViolation !== 'boolean') {
            batch.update(record.ref, { isViolation });
            batchHasOperations = true;
            updatedCount++;
        }
    }

    if (batchHasOperations) {
        await batch.commit();
    }
  }

  console.log(`Updated violation status for ${updatedCount} records.`);
}

fixViolations().catch(console.error);
