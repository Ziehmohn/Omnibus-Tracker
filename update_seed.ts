import fs from 'fs';

const products = JSON.parse(fs.readFileSync('all_products_v3.json', 'utf8'));

// Format products string
const productsStr = JSON.stringify(products, null, 2);

const content = `import { collection, doc, writeBatch, serverTimestamp, Timestamp, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

const MARKETPLACES = ["Praxis"];

// Scraped prices for "Yarenza" products on Praxis.nl
const REAL_ITEMS = ${productsStr};

export const seedDatabase = async () => {
  const itemsRef = collection(db, "items");
  const itemsSnap = await getDocs(itemsRef);
  if (!itemsSnap.empty) {
    console.log("Database already seeded");
    return;
  }

  let batch = writeBatch(db);
  let operationsCount = 0;

  for (let i = 0; i < REAL_ITEMS.length; i++) {
    const item = REAL_ITEMS[i];
    const itemId = \`yarenza-item-\${i}\`;
    const itemRef = doc(db, "items", itemId);
    
    batch.set(itemRef, {
      name: item.name,
      sku: item.sku,
      url: item.url,
      marketplace: "Praxis",
      productset: "Yarenza",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    operationsCount++;

    const basePrice = item.price; // This is the m2 current price
    const originalPrice = item.strikethroughPrice || (basePrice * 1.5); // Strikethrough if exists
    const trackingStartDate = new Date('2026-05-08T12:00:00Z');
    
    for (let day = 0; day <= 4; day++) {
      const date = new Date(trackingStartDate);
      date.setDate(date.getDate() + day);
      
      let cp = basePrice;
      let sp = item.strikethroughPrice || null;
      let dp = sp ? Math.round((1 - (cp / sp)) * 100) : null;
      let sd = sp ? new Date(trackingStartDate) : null; // "Gültig seit" is May 8 always
      let isViolation = false;

      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const dateString = \`\${yyyy}\${mm}\${dd}\`;

      const hRef = doc(db, \`items/\${itemId}/priceRecords\`, dateString);
      
      let tsDiscountStartDate = sd ? Timestamp.fromMillis(sd.getTime()) : null;
      let tsDate = Timestamp.fromMillis(date.getTime());
        
      batch.set(hRef, {
        currentPrice: cp,
        strikethroughPrice: sp,
        discountPercentage: dp,
        discountStartDate: tsDiscountStartDate,
        date: tsDate,
        itemId: itemId,
        isViolation: isViolation
      });
      operationsCount++;

      if (operationsCount >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        operationsCount = 0;
      }
    }
  }

  if (operationsCount > 0) {
    await batch.commit();
  }
  
  console.log("Database seeded successfully");
};
`
fs.writeFileSync('src/services/seedService.ts', content);
