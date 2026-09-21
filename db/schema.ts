export type Category = { id: string; name: string; sortOrder: number; active: boolean };
export type Dish = { id: string; categoryId: string; name: string; description: string; priceCents: number; imageUrl: string; available: boolean; sortOrder: number };
export type OrderStatus = "pending" | "preparing" | "completed" | "refunded";

