import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsDateString,
  Length,
} from 'class-validator';

export class KYCClaimsDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 2)
  country!: string; // ISO 3166-1 alpha-2

  @IsInt()
  @Min(0)
  @Max(150)
  age!: number;

  @IsBoolean()
  accredited!: boolean;
}

export class IssueCredentialDto {
  @IsString()
  @IsNotEmpty()
  issuerDID!: string;

  @IsString()
  @IsNotEmpty()
  subjectDID!: string;

  claims!: KYCClaimsDto;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class VerifyCredentialDto {
  @IsNotEmpty()
  vc!: Record<string, unknown>;
}
