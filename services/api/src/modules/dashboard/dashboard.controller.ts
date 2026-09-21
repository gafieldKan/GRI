import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

/**
 * 数据大屏切面（M5 dashboard 子切片）。
 *
 * 路径沿用旧后端契约：/api/dashboard/stats/{overview|orders-trend|region-distribution|top-products|user-funnel}。
 * 全部为只读聚合，走 public-routes.ts 公开读白名单（与旧后端一致）；响应裸 body（无信封）。
 */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats/overview')
  overview() {
    return this.dashboardService.getOverview();
  }

  @Get('stats/orders-trend')
  ordersTrend() {
    return this.dashboardService.getOrdersTrend();
  }

  @Get('stats/region-distribution')
  regionDistribution() {
    return this.dashboardService.getRegionDistribution();
  }

  @Get('stats/top-products')
  topProducts() {
    return this.dashboardService.getTopProducts();
  }

  @Get('stats/user-funnel')
  userFunnel() {
    return this.dashboardService.getUserFunnel();
  }
}