import { Module } from '@nestjs/common';
import { IssuerService } from './issuer.service';
import { SorobanModule } from '../soroban/soroban.module';

@Module({
  imports: [SorobanModule],
  providers: [IssuerService],
  exports: [IssuerService],
})
export class IssuerModule {}
