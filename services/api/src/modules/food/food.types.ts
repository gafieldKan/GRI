export interface Restaurant {
  id: string;
  name: string;
  address: string;
  phone?: string;
  rating?: number;
  merchant_id?: string | null;
  status: 'open' | 'closed';
  created_at?: Date;
  updated_at?: Date;
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

export interface Review {
  id: string;
  order_id: string;
  user_id: string;
  restaurant_id: string;
  rating: number;
  content?: string | null;
  created_at?: Date;
  user_name?: string | null;
  avatar_url?: string | null;
}

export type DiscountType = 'fixed' | 'percent';
export type CouponStatus = 'active' | 'inactive' | 'expired';

export interface Coupon {
  id: string;
  code: string;
  name: string;
  discount_type: DiscountType;
  discount_value: number | string;
  min_amount: number | string;
  total_quantity: number;
  claimed_quantity: number;
  per_user_limit: number;
  start_at?: Date | string | null;
  end_at?: Date | string | null;
  mutex_group?: string | null;
  status: CouponStatus;
  created_at?: Date;
  updated_at?: Date;
}

export interface CouponClaim {
  id: string;
  coupon_id: string;
  user_id: string;
  claimed_at?: Date;
  order_id?: string | null;
  coupon?: Coupon;
}

export interface MerchantRestaurantDto {
  name: string;
  address: string;
  phone?: string;
  status?: 'open' | 'closed';
}

export interface MerchantDishDto {
  id?: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  image_url?: string;
  status?: 'available' | 'sold_out';
}

export interface MerchantOrderQuery {
  status?: string;
  restaurantId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface MerchantOrderStats {
  total: number;
  pending: number;
  paid: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  revenue: number;
}
