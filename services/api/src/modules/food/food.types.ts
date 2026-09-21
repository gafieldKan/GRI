export interface Restaurant {
  id: string;
  name: string;
  address: string;
  phone?: string;
  rating?: number;
  status: 'open' | 'closed';
  created_at?: Date;
}

export interface Dish {
  id: string;
  restaurant_id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  image_url?: string;
  status: 'available' | 'sold_out';
}

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'confirmed'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export interface Order {
  id: string;
  user_id: string;
  restaurant_id: string;
  total_amount: number;
  status: OrderStatus;
  created_at?: Date;
  updated_at?: Date;
}

export interface OrderItem {
  id: string;
  order_id: string;
  dish_id: string;
  quantity: number;
  price: number;
}

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';

/** 支付单（public.payments） */
export interface Payment {
  id: string;
  order_id: string;
  user_id: string;
  amount: number;
  method: string;
  status: PaymentStatus;
  transaction_id?: string;
  provider_ref?: string;
  created_at?: Date;
  updated_at?: Date;
}