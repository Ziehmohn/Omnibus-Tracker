import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function clearDb() {
  const itemsSnap = await getDocs(collection(db, "items"));
  for (const itemDoc of itemsSnap.docs) {
    const recordsSnap = await getDocs(collection(db, `items/${itemDoc.id}/priceRecords`));
    for (const recordDoc of recordsSnap.docs) {
      await deleteDoc(recordDoc.ref);
    }
    await deleteDoc(itemDoc.ref);
  }
  console.log("Database cleared");
  process.exit(0);
}
clearDb();
