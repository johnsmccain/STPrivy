import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { SorobanService } from "../soroban/soroban.service";
import { IssuerService } from "../issuers/issuer.service";
import { DOMAIN_EVENTS, DomainEvent } from "../../events/domain-events";
import {
  KYCClaims,
  VerifiableCredential,
  VCProof,
  VerificationResult,
} from "./credential.types";
import { createHash, randomUUID } from "crypto";
import { Keypair, nativeToScVal } from "@stellar/stellar-sdk";
import { CredentialStatus, Prisma } from "@prisma/client";

@Injectable()
export class CredentialService {
  private readonly logger = new Logger(CredentialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sorobanService: SorobanService,
    private readonly issuerService: IssuerService,
    private readonly eventEmitter: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  /**
   * Issue a W3C Verifiable Credential.
   * Requirements: 3.1, 3.2, 3.3, 3.6, 3.7, 3.8
   */
  async issueCredential(
    issuerDID: string,
    subjectDID: string,
    claims: KYCClaims,
    expiresAt?: Date,
  ): Promise<VerifiableCredential> {
    // 1. Resolve issuer record from DB
    const issuerRecord = await this.prisma.issuer.findUnique({
      where: { did: issuerDID },
    });

    if (!issuerRecord || !issuerRecord.active) {
      throw new ForbiddenException("Issuer is not registered or inactive");
    }

    // 2. Verify issuer is registered on-chain (Requirement 3.3, 9.3)
    const registered = await this.issuerService.isRegistered(
      issuerRecord.stellarAddress,
    );
    if (!registered) {
      throw new ForbiddenException("Issuer is not registered on-chain");
    }

    // 3. Only store permitted claims — no raw PII (Requirement 3.8)
    const sanitizedClaims: KYCClaims = {
      country: claims.country,
      age: claims.age,
      accredited: claims.accredited,
    };

    const issuanceDate = new Date();
    const credentialId = `urn:uuid:${randomUUID()}`;

    // 4. Compute credential hash (SHA-256) — Requirement 3.2, Property 7
    const credentialHash = this.computeCredentialHash(
      sanitizedClaims,
      issuerDID,
      subjectDID,
      issuanceDate,
    );

    // 5. Sign the VC with the server's Stellar keypair (Ed25519Signature2020)
    const serverSecret = this.config.get<string>("STELLAR_SERVER_SECRET")!;
    const signerKeypair = Keypair.fromSecret(serverSecret);

    const vcBody = this.buildVCBody(
      credentialId,
      issuerDID,
      subjectDID,
      sanitizedClaims,
      issuanceDate,
      expiresAt,
    );

    const proof = this.signVC(vcBody, signerKeypair, issuanceDate);
    const vc: VerifiableCredential = { ...vcBody, proof };

    // 6. Anchor credential hash on Soroban (best-effort)
    let onChainTxHash: string | null = null;
    try {
      const invokeResult = await this.sorobanService.invokeContract(
        "credential-registry",
        "issue_credential",
        [
          nativeToScVal(Buffer.from(credentialHash, "hex"), { type: "bytes" }),
          nativeToScVal(issuerRecord.stellarAddress, { type: "address" }),
          nativeToScVal(BigInt(Math.floor(issuanceDate.getTime() / 1000)), {
            type: "u64",
          }),
          expiresAt
            ? nativeToScVal(BigInt(Math.floor(expiresAt.getTime() / 1000)), {
                type: "u64",
              })
            : nativeToScVal(null),
        ],
        serverSecret,
      );
      onChainTxHash = invokeResult.txHash;
    } catch (err) {
      this.logger.error(
        `Soroban anchoring failed for credential ${credentialId}: ${(err as Error).message}`,
      );
    }

    // 7. Persist credential record (Requirement 3.7)
    const dbRecord = await this.prisma.credential.create({
      data: {
        id: credentialId.replace("urn:uuid:", ""),
        issuerId: issuerRecord.id,
        subjectDID,
        type: vc.type,
        claims: sanitizedClaims as unknown as Prisma.InputJsonValue,
        proof: proof as unknown as Prisma.InputJsonValue,
        credentialHash,
        issuedAt: issuanceDate,
        expiresAt: expiresAt ?? null,
        status: CredentialStatus.ACTIVE,
        onChainTxHash,
      },
    });

    // 8. Emit CredentialIssued domain event (Requirement 3.6)
    const domainEvent: DomainEvent = {
      name: DOMAIN_EVENTS.CREDENTIAL_ISSUED,
      actorDID: issuerDID,
      subjectDID,
      resourceId: dbRecord.id,
      timestamp: issuanceDate,
      metadata: {
        credentialHash,
        onChainTxHash,
        claims: sanitizedClaims,
      },
    };
    this.eventEmitter.emit(DOMAIN_EVENTS.CREDENTIAL_ISSUED, domainEvent);

    return vc;
  }

  /**
   * Fetch a credential by ID, enforcing ownership or role-based access.
   * Requirements: 3.4, 3.5
   */
  async getCredential(
    id: string,
    requesterDID: string,
  ): Promise<VerifiableCredential> {
    const record = await this.prisma.credential.findUnique({
      where: { id },
      include: { issuer: true },
    });

    if (!record) {
      throw new NotFoundException(`Credential ${id} not found`);
    }

    const isSubject = record.subjectDID === requesterDID;
    const isIssuer = record.issuer.did === requesterDID;

    if (!isSubject && !isIssuer) {
      throw new ForbiddenException("Access denied");
    }

    return this.recordToVC(record);
  }

  /**
   * Verify a VC's Ed25519 signature, revocation status, and expiry.
   * Requirements: 4.1, 4.2, 4.3, 4.4
   */
  async verifyCredential(
    vc: VerifiableCredential,
  ): Promise<VerificationResult> {
    // 1. Check expiry (Requirement 4.3)
    if (vc.expirationDate) {
      const expiry = new Date(vc.expirationDate);
      if (expiry < new Date()) {
        return { valid: false, reason: "expired" };
      }
    }

    // 2. Verify Ed25519 signature (Requirement 4.1, 4.4)
    const signatureValid = this.verifyVCSignature(vc);
    if (!signatureValid) {
      return { valid: false, reason: "invalid_signature" };
    }

    // 3. Check revocation via DB (Requirement 4.2)
    const credentialId = vc.id.replace("urn:uuid:", "");
    const record = await this.prisma.credential.findUnique({
      where: { id: credentialId },
      include: { revocation: true },
    });

    if (record?.status === CredentialStatus.REVOKED || record?.revocation) {
      return { valid: false, reason: "revoked" };
    }

    return { valid: true };
  }

  // ── Public helpers ───────────────────────────────────────────────────────

  /**
   * Compute SHA-256 hash of credential contents (deterministic).
   * Property 7: same inputs always produce same hash.
   */
  computeCredentialHash(
    claims: KYCClaims,
    issuerDID: string,
    subjectDID: string,
    issuedAt: Date,
  ): string {
    const sortedClaims = {
      accredited: claims.accredited,
      age: claims.age,
      country: claims.country,
    };
    const payload = JSON.stringify({
      claims: sortedClaims,
      issuedAt: issuedAt.toISOString(),
      issuerDID,
      subjectDID,
    });
    return createHash("sha256").update(payload).digest("hex");
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildVCBody(
    id: string,
    issuerDID: string,
    subjectDID: string,
    claims: KYCClaims,
    issuanceDate: Date,
    expiresAt?: Date,
  ): Omit<VerifiableCredential, "proof"> {
    return {
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1",
      ],
      id,
      type: ["VerifiableCredential", "KYCCredential"],
      issuer: issuerDID,
      issuanceDate: issuanceDate.toISOString(),
      ...(expiresAt ? { expirationDate: expiresAt.toISOString() } : {}),
      credentialSubject: {
        id: subjectDID,
        ...claims,
      },
    };
  }

  private signVC(
    vcBody: Omit<VerifiableCredential, "proof">,
    keypair: Keypair,
    created: Date,
  ): VCProof {
    const message = Buffer.from(JSON.stringify(vcBody), "utf8");
    const signature = keypair.sign(message);
    const proofValue = Buffer.from(signature).toString("base64url");

    return {
      type: "Ed25519Signature2020",
      created: created.toISOString(),
      verificationMethod: `${vcBody.issuer}#key-1`,
      proofPurpose: "assertionMethod",
      proofValue,
    };
  }

  private verifyVCSignature(vc: VerifiableCredential): boolean {
    try {
      const { proof, ...vcBody } = vc;
      const message = Buffer.from(JSON.stringify(vcBody), "utf8");
      const signature = Buffer.from(proof.proofValue, "base64url");

      // Extract public key from verificationMethod: did:stellar:G...#key-1
      const publicKey = proof.verificationMethod
        .split("#")[0]
        .replace("did:stellar:", "");

      const keypair = Keypair.fromPublicKey(publicKey);
      return keypair.verify(message, signature);
    } catch (err) {
      this.logger.debug(
        `Signature verification error: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private recordToVC(record: {
    id: string;
    issuer: { did: string };
    subjectDID: string;
    type: string[];
    claims: unknown;
    proof: unknown;
    issuedAt: Date;
    expiresAt: Date | null;
  }): VerifiableCredential {
    const claims = record.claims as KYCClaims;
    const proof = record.proof as VCProof;
    return {
      "@context": [
        "https://www.w3.org/2018/credentials/v1",
        "https://w3id.org/security/suites/ed25519-2020/v1",
      ],
      id: `urn:uuid:${record.id}`,
      type: record.type,
      issuer: record.issuer.did,
      issuanceDate: record.issuedAt.toISOString(),
      ...(record.expiresAt
        ? { expirationDate: record.expiresAt.toISOString() }
        : {}),
      credentialSubject: {
        id: record.subjectDID,
        ...claims,
      },
      proof,
    };
  }
}
