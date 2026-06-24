import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { CredentialService } from "./credential.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SorobanService } from "../soroban/soroban.service";
import { IssuerService } from "../issuers/issuer.service";
import { KYCClaims, VerifiableCredential } from "./credential.types";
import { CredentialStatus } from "@prisma/client";
import { Keypair } from "@stellar/stellar-sdk";
import { DOMAIN_EVENTS } from "../../events/domain-events";

const TEST_KEYPAIR = Keypair.random();
const TEST_SERVER_SECRET = TEST_KEYPAIR.secret();

// ISSUER_DID must encode the same public key as TEST_KEYPAIR so that
// verifyVCSignature can recover the public key from the verificationMethod.
const ISSUER_DID = `did:stellar:${TEST_KEYPAIR.publicKey()}`;
const SUBJECT_DID = "did:stellar:GBXXX1111111111111111111111111111111111111";

const MOCK_CLAIMS: KYCClaims = { country: "US", age: 25, accredited: true };

const MOCK_ISSUER_RECORD = {
  id: "issuer-uuid-1",
  did: ISSUER_DID,
  stellarAddress: TEST_KEYPAIR.publicKey(),
  name: "Test Issuer",
  registeredAt: new Date(),
  active: true,
  onChainTxHash: null,
};

function buildMocks() {
  const prisma = {
    issuer: { findUnique: jest.fn() },
    credential: { create: jest.fn(), findUnique: jest.fn() },
  } as unknown as jest.Mocked<PrismaService>;

  const soroban = {
    invokeContract: jest.fn().mockResolvedValue({ txHash: "abc123", result: undefined }),
    simulateContract: jest.fn(),
  } as unknown as jest.Mocked<SorobanService>;

  const issuerService = {
    isRegistered: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<IssuerService>;

  const eventEmitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

  const config = {
    get: jest.fn((key: string) => (key === "STELLAR_SERVER_SECRET" ? TEST_SERVER_SECRET : undefined)),
  } as unknown as jest.Mocked<ConfigService>;

  return { prisma, soroban, issuerService, eventEmitter, config };
}

async function createService(mocks: ReturnType<typeof buildMocks>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CredentialService,
      { provide: PrismaService, useValue: mocks.prisma },
      { provide: SorobanService, useValue: mocks.soroban },
      { provide: IssuerService, useValue: mocks.issuerService },
      { provide: EventEmitter2, useValue: mocks.eventEmitter },
      { provide: ConfigService, useValue: mocks.config },
    ],
  }).compile();
  return module.get<CredentialService>(CredentialService);
}

describe("CredentialService", () => {
  describe("issueCredential", () => {
    it("throws 403 when issuer not found in DB", async () => {
      const mocks = buildMocks();
      (mocks.prisma.issuer.findUnique as jest.Mock).mockResolvedValue(null);
      const service = await createService(mocks);
      await expect(service.issueCredential(ISSUER_DID, SUBJECT_DID, MOCK_CLAIMS)).rejects.toThrow(ForbiddenException);
    });

    it("throws 403 when issuer is inactive", async () => {
      const mocks = buildMocks();
      (mocks.prisma.issuer.findUnique as jest.Mock).mockResolvedValue({ ...MOCK_ISSUER_RECORD, active: false });
      const service = await createService(mocks);
      await expect(service.issueCredential(ISSUER_DID, SUBJECT_DID, MOCK_CLAIMS)).rejects.toThrow(ForbiddenException);
    });

    it("throws 403 when issuer is not registered on-chain", async () => {
      const mocks = buildMocks();
      (mocks.prisma.issuer.findUnique as jest.Mock).mockResolvedValue(MOCK_ISSUER_RECORD);
      (mocks.issuerService.isRegistered as jest.Mock).mockResolvedValue(false);
      const service = await createService(mocks);
      await expect(service.issueCredential(ISSUER_DID, SUBJECT_DID, MOCK_CLAIMS)).rejects.toThrow(ForbiddenException);
    });

    it("issues credential with all required W3C fields (Property 6)", async () => {
      const mocks = buildMocks();
      (mocks.prisma.issuer.findUnique as jest.Mock).mockResolvedValue(MOCK_ISSUER_RECORD);
      (mocks.prisma.credential.create as jest.Mock).mockImplementation((args) => ({ ...args.data, issuer: MOCK_ISSUER_RECORD }));
      const service = await createService(mocks);

      const vc = await service.issueCredential(ISSUER_DID, SUBJECT_DID, MOCK_CLAIMS);

      expect(vc["@context"]).toBeDefined();
      expect(vc.id).toBeDefined();
      expect(vc.type).toContain("VerifiableCredential");
      expect(vc.issuer).toBe(ISSUER_DID);
      expect(vc.issuanceDate).toBeDefined();
      expect(vc.credentialSubject.id).toBe(SUBJECT_DID);
      expect(vc.proof).toBeDefined();
      expect(vc.proof.type).toBe("Ed25519Signature2020");
    });

    it("only stores country/age/accredited — no extra PII (Property 9)", async () => {
      const mocks = buildMocks();
      (mocks.prisma.issuer.findUnique as jest.Mock).mockResolvedValue(MOCK_ISSUER_RECORD);
      let savedClaims: unknown;
      (mocks.prisma.credential.create as jest.Mock).mockImplementation((args) => {
        savedClaims = args.data.claims;
        return { ...args.data, issuer: MOCK_ISSUER_RECORD };
      });
      const service = await createService(mocks);

      const claimsWithPII = { ...MOCK_CLAIMS, passportNumber: "ABC123456", fullName: "John Doe" } as unknown as KYCClaims;
      await service.issueCredential(ISSUER_DID, SUBJECT_DID, claimsWithPII);

      const stored = savedClaims as Record<string, unknown>;
      expect(Object.keys(stored)).toEqual(["country", "age", "accredited"]);
      expect(stored["passportNumber"]).toBeUndefined();
      expect(stored["fullName"]).toBeUndefined();
    });

    it("emits CredentialIssued domain event (Requirement 3.6)", async () => {
      const mocks = buildMocks();
      (mocks.prisma.issuer.findUnique as jest.Mock).mockResolvedValue(MOCK_ISSUER_RECORD);
      (mocks.prisma.credential.create as jest.Mock).mockImplementation((args) => ({ ...args.data, issuer: MOCK_ISSUER_RECORD }));
      const service = await createService(mocks);

      await service.issueCredential(ISSUER_DID, SUBJECT_DID, MOCK_CLAIMS);

      expect(mocks.eventEmitter.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.CREDENTIAL_ISSUED,
        expect.objectContaining({ name: DOMAIN_EVENTS.CREDENTIAL_ISSUED, actorDID: ISSUER_DID, subjectDID: SUBJECT_DID }),
      );
    });

    it("credential hash is deterministic (Property 7)", async () => {
      const mocks = buildMocks();
      const service = await createService(mocks);
      const now = new Date();
      const hash1 = service.computeCredentialHash(MOCK_CLAIMS, ISSUER_DID, SUBJECT_DID, now);
      const hash2 = service.computeCredentialHash(MOCK_CLAIMS, ISSUER_DID, SUBJECT_DID, now);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("different inputs produce different hashes", async () => {
      const mocks = buildMocks();
      const service = await createService(mocks);
      const now = new Date();
      const hash1 = service.computeCredentialHash(MOCK_CLAIMS, ISSUER_DID, SUBJECT_DID, now);
      const hash2 = service.computeCredentialHash({ ...MOCK_CLAIMS, age: 30 }, ISSUER_DID, SUBJECT_DID, now);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("getCredential", () => {
    const PROOF = {
      type: "Ed25519Signature2020",
      created: new Date().toISOString(),
      verificationMethod: `${ISSUER_DID}#key-1`,
      proofPurpose: "assertionMethod",
      proofValue: "sig",
    };

    it("returns VC when requester is the subject", async () => {
      const mocks = buildMocks();
      (mocks.prisma.credential.findUnique as jest.Mock).mockResolvedValue({
        id: "cred-1",
        issuer: { did: ISSUER_DID },
        subjectDID: SUBJECT_DID,
        type: ["VerifiableCredential"],
        claims: MOCK_CLAIMS,
        proof: PROOF,
        issuedAt: new Date(),
        expiresAt: null,
        status: CredentialStatus.ACTIVE,
      });
      const service = await createService(mocks);
      const vc = await service.getCredential("cred-1", SUBJECT_DID);
      expect(vc.credentialSubject.id).toBe(SUBJECT_DID);
    });

    it("returns VC when requester is the issuer", async () => {
      const mocks = buildMocks();
      (mocks.prisma.credential.findUnique as jest.Mock).mockResolvedValue({
        id: "cred-1",
        issuer: { did: ISSUER_DID },
        subjectDID: SUBJECT_DID,
        type: ["VerifiableCredential"],
        claims: MOCK_CLAIMS,
        proof: PROOF,
        issuedAt: new Date(),
        expiresAt: null,
        status: CredentialStatus.ACTIVE,
      });
      const service = await createService(mocks);
      const vc = await service.getCredential("cred-1", ISSUER_DID);
      expect(vc.issuer).toBe(ISSUER_DID);
    });

    it("throws 404 when credential not found", async () => {
      const mocks = buildMocks();
      (mocks.prisma.credential.findUnique as jest.Mock).mockResolvedValue(null);
      const service = await createService(mocks);
      await expect(service.getCredential("missing", SUBJECT_DID)).rejects.toThrow(NotFoundException);
    });

    it("throws 403 when requester is neither subject nor issuer", async () => {
      const mocks = buildMocks();
      (mocks.prisma.credential.findUnique as jest.Mock).mockResolvedValue({
        id: "cred-1",
        issuer: { did: ISSUER_DID },
        subjectDID: SUBJECT_DID,
        type: ["VerifiableCredential"],
        claims: MOCK_CLAIMS,
        proof: PROOF,
        issuedAt: new Date(),
        expiresAt: null,
        status: CredentialStatus.ACTIVE,
      });
      const service = await createService(mocks);
      await expect(service.getCredential("cred-1", "did:stellar:STRANGER")).rejects.toThrow(ForbiddenException);
    });
  });

  describe("verifyCredential", () => {
    async function makeIssuedVC(): Promise<VerifiableCredential> {
      const mocks = buildMocks();
      (mocks.prisma.issuer.findUnique as jest.Mock).mockResolvedValue(MOCK_ISSUER_RECORD);
      (mocks.prisma.credential.create as jest.Mock).mockImplementation((args) => ({ ...args.data, issuer: MOCK_ISSUER_RECORD }));
      (mocks.prisma.credential.findUnique as jest.Mock).mockResolvedValue(null);
      const service = await createService(mocks);
      return service.issueCredential(ISSUER_DID, SUBJECT_DID, MOCK_CLAIMS);
    }

    it("returns valid=true for a freshly issued VC (Property 10)", async () => {
      const mocks = buildMocks();
      (mocks.prisma.issuer.findUnique as jest.Mock).mockResolvedValue(MOCK_ISSUER_RECORD);
      (mocks.prisma.credential.create as jest.Mock).mockImplementation((args) => ({ ...args.data, issuer: MOCK_ISSUER_RECORD }));
      (mocks.prisma.credential.findUnique as jest.Mock).mockResolvedValue(null);
      const service = await createService(mocks);
      const vc = await service.issueCredential(ISSUER_DID, SUBJECT_DID, MOCK_CLAIMS);
      const result = await service.verifyCredential(vc);
      expect(result.valid).toBe(true);
    });

    it("returns invalid_signature for a tampered VC (Property 11)", async () => {
      const vc = await makeIssuedVC();
      const mocks = buildMocks();
      (mocks.prisma.credential.findUnique as jest.Mock).mockResolvedValue(null);
      const service = await createService(mocks);

      const tampered = { ...vc, credentialSubject: { ...vc.credentialSubject, age: 99 } };
      const result = await service.verifyCredential(tampered);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_signature");
    });

    it("returns revoked when credential has a revocation record", async () => {
      const vc = await makeIssuedVC();
      const mocks = buildMocks();
      (mocks.prisma.credential.findUnique as jest.Mock).mockResolvedValue({
        status: CredentialStatus.REVOKED,
        revocation: { revokedAt: new Date() },
      });
      const service = await createService(mocks);
      const result = await service.verifyCredential(vc);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("revoked");
    });

    it("returns expired for a VC past its expirationDate", async () => {
      const mocks = buildMocks();
      const service = await createService(mocks);

      const expiredVC: VerifiableCredential = {
        "@context": ["https://www.w3.org/2018/credentials/v1"],
        id: "urn:uuid:old",
        type: ["VerifiableCredential"],
        issuer: ISSUER_DID,
        issuanceDate: new Date(Date.now() - 1000000).toISOString(),
        expirationDate: new Date(Date.now() - 500).toISOString(),
        credentialSubject: { id: SUBJECT_DID },
        proof: {
          type: "Ed25519Signature2020",
          created: new Date().toISOString(),
          verificationMethod: `${ISSUER_DID}#key-1`,
          proofPurpose: "assertionMethod",
          proofValue: "dummy",
        },
      };

      const result = await service.verifyCredential(expiredVC);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("expired");
    });
  });
});
