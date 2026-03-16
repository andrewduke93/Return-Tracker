export interface ReturnItem {
  id: string;
  itemName: string;
  deadline: string; // ISO date
  packagingRules: string;
  imageUrl: string;
  mimeType?: string;
  status: 'pending' | 'completed';
  userId: string;
  createdAt: string;
  storeName?: string;
  storeHours?: string;
  storeAddress?: string;
}

export interface GeminiResponse {
  itemName: string;
  deadline: string;
  packagingRules: string;
  storeName?: string;
  storeHours?: string;
  storeAddress?: string;
}
