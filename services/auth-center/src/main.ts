import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 不设全局前缀。对外路径契约由 controller 显式声明：
  //   /auth/login /auth/register /auth/refresh /auth/logout /auth/me /auth/jwks
  // nginx 侧 /auth/ 转发到 auth-center:3004/（去前缀），路径原样命中。
  app.enableCors({ origin: true, credentials: true });

  // 全局请求体校验（DTO class-validator 生效）
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3004;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[GRI Auth Center] listening on http://localhost:${port}`);
}
bootstrap();