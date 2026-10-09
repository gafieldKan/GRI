import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** UUID 文本形态（宽松：不校验版本位，兼容 seed 固定 uuid） */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string; // email 或 username

  @IsString()
  @IsNotEmpty()
  password!: string;
}

/**
 * @deprecated 公开注册已迁移至统一入口 `POST /api/auth/register`（业务库先行建档 + 服务间写面注入 external_id）。
 * 保留类型仅为兼容旧签名；`/auth/register` 现已返回 410 Gone。
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

/**
 * 服务间写面入参：由业务后端 api 在「先建 public.users 拿到 uuid」后带 X-Service-Token 调用。
 * externalId 必须为 UUID 文本（= public.users.id，唯一身份映射点）；服务端拒绝空值。
 */
export class CreateIdentityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  domain!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsString()
  @Matches(UUID_RE, { message: 'externalId 必须为 UUID（= public.users.id）' })
  externalId!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  oldPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}