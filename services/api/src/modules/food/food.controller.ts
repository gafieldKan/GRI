import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Req,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FoodService } from './food.service';
import { Request } from 'express';
import {
  MerchantDishDto,
  MerchantOrderQuery,
  MerchantRestaurantDto,
} from './food.types';

/**
 * 订餐切片（M2 + M5 垂直一补面）。
 *
 * 鉴权由全局 AuthRouterMiddleware（main.ts 一处挂接）决定，白名单见 src/auth/public-routes.ts：
 *   - 公开读：GET /food/restaurants[/:id][/dishes] —— 游客匿名可见（目录浏览）；
 *   - 公开回调：POST /food/payments/notify —— 支付网关通知（签名校验 + 幂等 + 金额锁库）；
 *   - 其余（订单读写、支付发起/退款）—— 强制鉴权，身份取 req.auth.externalId。
 * 路由顺序注意：字面 'orders/me' 必须声明在参数 ':id' 之前，否则 /orders/me 被 ParseUUIDPipe 吞成 400。
 */
@Controller('food')
export class FoodController {
  constructor(private readonly foodService: FoodService) {}

  // --- 公开读（目录浏览） ---

  @Get('restaurants')
  getAllRestaurants() {
    return this.foodService.findAllRestaurants();
  }

  @Get('restaurants/:id')
  getRestaurant(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.foodService.findRestaurantById(id);
  }

  @Get('restaurants/:id/dishes')
  getDishes(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.foodService.findDishesByRestaurant(id);
  }

  @Get('restaurants/:id/reviews')
  getReviews(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.foodService.getReviews(id);
  }

  // --- 优惠券（公开列券；领取/我的券强制鉴权） ---

  @Get('coupons')
  listCoupons() {
    return this.foodService.listCoupons();
  }

  @Post('coupons/claim')
  claimCoupon(
    @Req() req: Request,
    @Body() body: { couponId: string; orderId?: string },
  ) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.claimCoupon(auth.externalId, body);
  }

  @Get('coupons/my')
  getMyCoupons(@Req() req: Request) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.getMyCoupons(auth.externalId);
  }

  // --- 订单（登录写 / 读；本人或特权） ---

  @Get('orders/me')
  getMyOrders(@Req() req: Request, @Query('status') status?: string) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.getOrdersByUser(auth.externalId, status);
  }

  @Get('orders')
  getOrders(@Req() req: Request, @Query('status') status?: string) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.getOrdersByUser(auth.externalId, status);
  }

  @Get('orders/:id')
  getOrder(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.getOrderById(auth.externalId, id);
  }

  @Post('orders')
  createOrder(@Req() req: Request, @Body() body: { restaurantId: string; items: { dishId: string; quantity: number }[] }) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.createOrder(auth.externalId, body);
  }

  @Post('orders/:id/confirm')
  confirmOrder(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.confirmOrder(auth.externalId, id);
  }

  @Post('orders/:id/cancel')
  cancelOrder(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: { reason?: string }) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.cancelOrder(auth.externalId, id, body?.reason);
  }

  @Post('orders/:id/complete')
  completeOrder(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.completeOrder(auth.externalId, id);
  }

  @Post('orders/:id/review')
  createReview(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { rating: number; content?: string },
  ) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.createReview(auth.externalId, id, body);
  }

  // --- 商家后台（数据归属校验；运营可跨商家管理） ---

  @Get('merchant/restaurants')
  merchantListRestaurants(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.merchantListRestaurants(auth.externalId, { status, q });
  }

  @Post('merchant/restaurants')
  merchantCreateRestaurant(@Req() req: Request, @Body() body: MerchantRestaurantDto) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.merchantCreateRestaurant(auth.externalId, body);
  }

  @Put('merchant/restaurants/:id')
  merchantUpdateRestaurant(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: Partial<MerchantRestaurantDto>,
  ) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.merchantUpdateRestaurant(auth.externalId, id, body);
  }

  @Post('merchant/restaurants/:id/dishes')
  merchantUpsertDishes(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { dishes: MerchantDishDto[] },
  ) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.merchantUpsertDishes(auth.externalId, id, body.dishes);
  }

  @Get('merchant/orders/stats')
  merchantOrderStats(@Req() req: Request) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.merchantOrderStats(auth.externalId);
  }

  @Get('merchant/orders')
  merchantListOrders(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('restaurantId') restaurantId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const auth = (req as any).auth as { externalId: string };
    const query: MerchantOrderQuery = {
      status,
      restaurantId,
      from,
      to,
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset),
    };
    return this.foodService.merchantListOrders(auth.externalId, query);
  }

  // --- 支付（发起/退款登录；notify 公开回调白名单） ---

  @Post('payments/process')
  processPayment(
    @Req() req: Request,
    @Body() body: { orderId: string; method?: string },
  ) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.createPayment(auth.externalId, body.orderId, body.method);
  }

  @Post('payments/notify')
  notifyPayment(@Body() body: {
    orderId: string;
    transactionId: string;
    amount: number | string;
    method?: string;
    signature?: string;
  }) {
    return this.foodService.notifyPayment(body);
  }

  @Post('payments/refund')
  refundPayment(
    @Req() req: Request,
    @Body() body: { orderId: string; reason?: string },
  ) {
    const auth = (req as any).auth as { externalId: string };
    return this.foodService.refundPayment(auth.externalId, body.orderId, body.reason);
  }
}
