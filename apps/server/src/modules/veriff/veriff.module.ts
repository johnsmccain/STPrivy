import { Module } from '@nestjs/common';
import { VeriffService } from './veriff.service';
import { VeriffController } from './veriff.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { CredentialModule } from '../credentials/credential.module';

@Module({
  imports: [PrismaModule, CredentialModule],
  controllers: [VeriffController],
  providers: [VeriffService],
})
export class VeriffModule {}
