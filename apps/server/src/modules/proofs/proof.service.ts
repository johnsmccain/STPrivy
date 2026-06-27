import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { SorobanService } from '../soroban/soroban.service';
import { DOMAIN_EVENTS } from '../../events/domain-events';
import { ProofStatus, Prisma } from '@prisma/client';
import { nativeToScVal } from '@stellar/stellar-sdk';

@Injectable()
export class ProofService {
  private readonly logger = new Logger(ProofService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly soroban: SorobanService,
    private readonly events: EventEmitter2,
    @InjectQueue('proof-generation') private readonly proofQueue: Queue,
  ) {}

  /** List all proofs belonging to the requesting subject DID */
  async listBySubject(subjectDID: string) {
    return this.prisma.zKProof.findMany({
      where: { subjectDID },
      orderBy: { generatedAt: 'desc' },
    });
  }

  /** List all verifications the user has made */
  async listVerifications(verifierDID: string) {
    return this.prisma.proofVerification.findMany({
      where: { verifierDID },
      orderBy: { verifiedAt: 'desc' },
    });
  }

  /**
   * Enqueue a ZK proof generation job.
   * The job is processed asynchronously by the BullMQ worker.
   */
  async generateProof(
    subjectDID: string,
    credentialId: string,
    circuitId: string,
  ) {
    // Validate the credential exists and belongs to the subject
    const credential = await this.prisma.credential.findUnique({
      where: { id: credentialId },
    });
    if (!credential) throw new NotFoundException('Credential not found');
    if (credential.subjectDID !== subjectDID)
      throw new ForbiddenException('Credential does not belong to you');
    if (credential.status !== 'ACTIVE')
      throw new BadRequestException('Credential is not active');

    // Create the proof record in PENDING state
    const proof = await this.prisma.zKProof.create({
      data: {
        subjectDID,
        credentialId,
        circuitId,
        status: ProofStatus.PENDING,
      },
    });

    // Enqueue the proof generation job to BullMQ
    await this.proofQueue.add('generate-proof', {
      proofId: proof.id,
      subjectDID,
      credentialId,
      circuitId,
      claims: credential.claims as Record<string, unknown>,
    });

    this.logger.log(`Proof generation job enqueued: ${proof.id} for circuit ${circuitId}`);

    return proof;
  }

  /** Verify a completed proof — local check + optional on-chain verification */
  async verifyProof(proofId: string, verifierDID: string) {
    const proof = await this.prisma.zKProof.findUnique({
      where: { id: proofId },
    });
    if (!proof) throw new NotFoundException('Proof not found');
    if (proof.status !== ProofStatus.COMPLETED)
      throw new BadRequestException(`Proof is not ready (status: ${proof.status})`);

    const artifact = proof.artifact as Record<string, unknown> | null;
    const valid = !!(artifact && artifact.proof && artifact.publicInputs);

    // Best-effort on-chain verification via Soroban
    let onChainTxHash: string | null = null;
    if (valid && artifact?.proof && artifact?.publicInputs) {
      try {
        const contractName = `proof-verifier-${proof.circuitId}` as const;
        const result = await this.soroban.invokeContract(
          contractName,
          'verify_proof',
          [
            nativeToScVal(Buffer.from(artifact.proof as string, 'hex'), { type: 'bytes' }),
            nativeToScVal(Buffer.from(artifact.publicInputs as string, 'hex'), { type: 'bytes' }),
          ],
          process.env.STELLAR_SERVER_SECRET!,
        );
        onChainTxHash = result.txHash;
      } catch (err) {
        this.logger.warn(`On-chain proof verification skipped: ${(err as Error).message}`);
      }
    }

    const verification = await this.prisma.proofVerification.create({
      data: {
        proofId,
        verifierDID,
        result: valid,
        onChainTxHash,
        metadata: (artifact ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
      },
    });

    this.events.emit(DOMAIN_EVENTS.PROOF_VERIFIED, {
      name: DOMAIN_EVENTS.PROOF_VERIFIED,
      actorDID: verifierDID,
      subjectDID: proof.subjectDID,
      resourceId: proofId,
      timestamp: new Date(),
      metadata: { valid, onChainTxHash },
    });

    return verification;
  }

}
