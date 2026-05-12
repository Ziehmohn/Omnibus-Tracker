export interface Item {
  id: string; // The Firestore document ID
  name: string;
  sku: string;
  url: string;
  marketplace: string;
  productset?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PriceRecord {
  id: string; // Document ID, typically YYYY-MM-DD
  itemId: string;
  currentPrice: number;
  strikethroughPrice: number | null;
  discountPercentage: number | null;
  discountStartDate: number | null; // Timestamp
  date: number; // Timestamp
  isViolation: boolean;
}

export interface ItemWithLatestPrice extends Item {
  latestRecord?: PriceRecord | null;
  history: PriceRecord[];
}
