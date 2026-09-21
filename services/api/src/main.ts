import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { AuthRouterMiddleware } from './auth/jwt-auth.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: true, credentials: true });

  // 全局路由前缀 /api（对齐蓝图拓扑：gateway 把 /api → services/api）。
  // 所有业务控制器挂到 /api/*，与 /api 鉴权中间件同域；仅 /health 探针留在前缀外（天然豁免鉴权）。
  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // 全局鉴权路由中间件（一处挂接，施工图 §2）：
  //   默认所有 /api/* 业务端点强制 Bearer RS256 JWT（无/坏 → 401）；
  //   命中公开读白名单（src/auth/public-routes.ts，如餐厅/菜品/知识图谱目录）→ 游客可匿名访问，
  //   已有 token 则照常校验并注入 req.auth 供个性化。
  //   /health 在 /api 前缀外，天然豁免。
  const auth = new AuthRouterMiddleware();
  app.use('/api', (req: Request, res: Response, next: NextFunction) => auth.use(req, res, next));

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3002;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[GRI API] listening on http://localhost:${port}`);
}
bootstrap();