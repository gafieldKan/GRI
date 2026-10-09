/**
 * 注册请求体（公开端点 `POST /api/auth/register`）。
 *
 * 说明：services/api 未引入 class-validator（容器 `npm ci --workspace=gri-api` 不含该依赖），
 * 故这里用**纯接口**而非装饰器类 —— 既避免 @Body() 变成需校验的类（会触发 ValidationPipe
 * 加载 class-validator 而崩），又把 fail-fast 校验放在 AuthService.register() 内手工执行。
 */
export interface RegisterDto {
  username: string;
  email?: string;
  phone?: string;
  password: string;
  name?: string;
}
