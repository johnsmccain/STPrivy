import { IsString, IsNotEmpty } from 'class-validator';

export class ChallengeQueryDto {
  @IsString()
  @IsNotEmpty()
  publicKey!: string;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  signedTransaction!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
