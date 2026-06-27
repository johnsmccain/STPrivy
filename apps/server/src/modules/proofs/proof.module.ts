import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ProofService } from './proof.service';
import { ProofController } from './proof.controller';
import { ProofGenerationWorker } from './proof-queue.worker';
import { PrismaModule } from '../../prisma/prisma.module';
import { SorobanModule } from '../soroban/soroban.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    SorobanModule,
    AuthModule,
    BullModule.registerQueue({
      name: 'proof-generation',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          count: 100,
        },
        removeOnFail: {
          count: 50,
        },
      },
    }),
  ],
  providers: [ProofService, ProofGenerationWorker],
  controllers: [ProofController],
  exports: [ProofService],
})
export class ProofModule {}
