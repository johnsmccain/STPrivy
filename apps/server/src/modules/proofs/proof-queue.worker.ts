import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DOMAIN_EVENTS } from '../../events/domain-events';
import { ProofStatus, Prisma } from '@prisma/client';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProofJobData {
  proofId: string;
  subjectDID: string;
  credentialId: string;
  circuitId: string;
  claims: Record<string, unknown>;
}

@Processor('proof-generation')
export class ProofGenerationWorker extends WorkerHost {
  private readonly logger = new Logger(ProofGenerationWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<ProofJobData>): Promise<void> {
    const { proofId, subjectDID, credentialId, circuitId, claims } = job.data;

    this.logger.log(`Processing proof generation job ${proofId} for circuit ${circuitId}`);

    try {
      await this.prisma.zKProof.update({
        where: { id: proofId },
        data: { status: ProofStatus.GENERATING },
      });

      // Use nargo CLI for proof generation as specified in design doc
      const circuitsBasePath = join(process.cwd(), '../../circuits');
      const circuitPath = join(circuitsBasePath, circuitId);

      // Prepare Prover.toml with witness data
      const proverTomlPath = join(circuitPath, 'Prover.toml');
      const backupPath = join(circuitPath, 'Prover.toml.backup');
      
      // Backup original Prover.toml
      if (existsSync(proverTomlPath)) {
        writeFileSync(backupPath, readFileSync(proverTomlPath));
      }

      // Write witness data to Prover.toml
      const witnessData = this.prepareWitnessToml(circuitId, claims);
      writeFileSync(proverTomlPath, witnessData);

      try {
        // Run nargo prove
        const { stdout, stderr } = await execAsync('nargo prove', {
          cwd: circuitPath,
        });

        if (stderr && !stderr.includes('Warning')) {
          this.logger.warn(`nargo prove warnings: ${stderr}`);
        }

        // Read the generated proof
        const proofPath = join(circuitPath, 'target', `${circuitId.replace('-', '_')}_proof.toml`);
        const proofData = readFileSync(proofPath, 'utf-8');

        // Serialize proof to hex for storage
        const proofHex = Buffer.from(proofData).toString('hex');

        // Update proof record with completed artifact
        await this.prisma.zKProof.update({
          where: { id: proofId },
          data: {
            status: ProofStatus.COMPLETED,
            artifact: {
              proof: proofHex,
              publicInputs: JSON.stringify(claims),
            } as unknown as Prisma.InputJsonValue,
            generatedAt: new Date(),
          },
        });

        // Emit domain event
        this.events.emit(DOMAIN_EVENTS.PROOF_GENERATED, {
          name: DOMAIN_EVENTS.PROOF_GENERATED,
          actorDID: subjectDID,
          subjectDID,
          resourceId: proofId,
          timestamp: new Date(),
          metadata: { circuitId, credentialId },
        });

        this.logger.log(`Proof ${proofId} generated successfully (circuit: ${circuitId})`);
      } finally {
        // Restore original Prover.toml
        if (existsSync(backupPath)) {
          writeFileSync(proverTomlPath, readFileSync(backupPath));
          unlinkSync(backupPath);
        }
      }
    } catch (error) {
      this.logger.error(`Proof generation failed for ${proofId}: ${(error as Error).message}`);

      await this.prisma.zKProof.update({
        where: { id: proofId },
        data: { status: ProofStatus.FAILED },
      });

      throw error; // Re-throw to trigger BullMQ retry logic
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<ProofJobData>) {
    this.logger.log(`Proof generation job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ProofJobData>, error: Error) {
    this.logger.error(`Proof generation job ${job.id} failed: ${error.message}`);
  }

  private prepareWitnessToml(circuitId: string, claims: Record<string, unknown>): string {
    // Map credential claims to Noir Prover.toml format based on circuit type
    switch (circuitId) {
      case 'age-proof':
        return `age = ${claims.age as number}
threshold = 18`;

      case 'residency-proof':
        const countryBytes = this.countryToBytes(claims.country as string);
        return `country_code = [${countryBytes[0]}, ${countryBytes[1]}]
allowed_countries = [
  [85, 83], [71, 66], [67, 65], [65, 85], [68, 69],
  [70, 82], [74, 80], [83, 71], [67, 72], [78, 76]
]
allowed_count = 10`;

      case 'accredited-investor':
        return `accredited = ${claims.accredited as boolean}
age = ${claims.age as number}`;

      case 'sanctions-check':
        return `sanctions_hash = ${this.computeSanctionsHash(claims)}
clean_list_commitment = ${this.getCleanListCommitment()}`;

      default:
        throw new Error(`Unknown circuit type: ${circuitId}`);
    }
  }

  private countryToBytes(countryCode: string): [number, number] {
    const upper = countryCode.toUpperCase();
    if (upper.length !== 2) {
      throw new Error(`Invalid country code: ${countryCode}. Must be 2 characters.`);
    }
    return [upper.charCodeAt(0), upper.charCodeAt(1)];
  }

  private computeSanctionsHash(claims: Record<string, unknown>): number {
    // Simplified sanctions hash computation
    // In production, this would query a real sanctions list and compute a Merkle proof
    const data = JSON.stringify(claims);
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }

  private getCleanListCommitment(): number {
    // Placeholder for clean list commitment
    // In production, this would be a commitment to the clean list from a trusted source
    return 0;
  }
}
