import { Module } from '@nestjs/common';
import { CredentialService } from './credential.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { SorobanModule } from '../soroban/soroban.module';
import { IssuerModule } from '../issuers/issuer.module';

@Module({
  imports: [PrismaModule, SorobanModule, IssuerModule],
  providers: [CredentialService],
  exports: [CredentialService],
})
export class CredentialModule {}
