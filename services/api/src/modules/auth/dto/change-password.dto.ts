/**
 * 改密请求体（`POST /api/auth/password`，Bearer）。
 * 纯接口（同 register.dto 说明）：api 侧不引入 class-validator，校验在 auth-center 侧执行。
 */
export interface ChangePasswordDto {
  oldPassword: string;
  newPassword: string;
}
