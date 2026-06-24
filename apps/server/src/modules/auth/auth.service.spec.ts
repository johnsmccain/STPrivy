import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { REDIS_CLIENT } from './redis.provider';
import { Keypair, Networks, WebAuth } from '@stellar/stellar-sdk';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const serverKeypair = Keypair.random();
const HOME_DOMAIN = 'localhost';
const NETWORK = Networks.TESTNET;

function makeConfigService(): ConfigService {
  const values: Record<string, unknown> = {
    STELLAR_SERVER_SECRET: serverKeypair.secret(),
    STELLAR_NETWORK: 'testnet',
    JWT_SECRET: 'test_secret_that_is_long_enough_32chars',
    JWT_ACCESS_EXPIRES_IN: '15m',
    HOME_DOMAIN,
  };
  return {
    get: <T>(key: string, fallback?: T): T =>
      (key in values ? values[key] : fallback) as T,
  } as unknown as ConfigService;
}

function makeJwtService(): JwtService {
  return {
    sign: jest.fn().mockReturnValue('mock.access.token'),
    verify: jest.fn(),
  } as unknown as JwtService;
}

function makeRedis() {
  const store = new Map<string, string>();
  return {
    setex: jest.fn(async (key: string, _ttl: number, val: string) => {
      store.set(key, val);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    _store: store,
  };
}

// ─── Build a properly signed challenge XDR ───────────────────────────────────

function buildSignedChallenge(clientKeypair: Keypair): string {
  const challengeXDR = WebAuth.buildChallengeTx(
    serverKeypair,
    clientKeypair.publicKey(),
    HOME_DOMAIN,
    300,
    NETWORK,
    HOME_DOMAIN,  // webAuthDomain (required in stellar-sdk v16)
  );

  // Client signs the challenge
  const { tx } = WebAuth.readChallengeTx(
    challengeXDR,
    serverKeypair.publicKey(),
    NETWORK,
    HOME_DOMAIN,
    HOME_DOMAIN,
  );
  tx.sign(clientKeypair);
  return tx.toEnvelope().toXDR('base64');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;
  let redis: ReturnType<typeof makeRedis>;
  let jwtService: JwtService;

  beforeEach(async () => {
    redis = makeRedis();
    jwtService = makeJwtService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: makeConfigService() },
        { provide: JwtService, useValue: jwtService },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── generateChallenge ───────────────────────────────────────────────────

  describe('generateChallenge', () => {
    it('returns a transaction string and nonce for a valid public key', async () => {
      const kp = Keypair.random();
      const result = await service.generateChallenge(kp.publicKey());

      expect(result.transaction).toBeTruthy();
      expect(result.nonce).toBeTruthy();
      expect(typeof result.transaction).toBe('string');
    });

    it('stores the nonce in Redis', async () => {
      const kp = Keypair.random();
      const { nonce } = await service.generateChallenge(kp.publicKey());

      expect(redis.setex).toHaveBeenCalledWith(
        expect.stringContaining(nonce),
        300,
        kp.publicKey(),
      );
    });

    it('returned XDR is parseable as a SEP-10 challenge', async () => {
      const kp = Keypair.random();
      const { transaction } = await service.generateChallenge(kp.publicKey());

      expect(() =>
        WebAuth.readChallengeTx(
          transaction,
          serverKeypair.publicKey(),
          NETWORK,
          HOME_DOMAIN,
          HOME_DOMAIN,
        ),
      ).not.toThrow();
    });
  });

  // ── verifyChallengeAndLogin ─────────────────────────────────────────────

  describe('verifyChallengeAndLogin', () => {
    it('returns accessToken and refreshToken for a valid signed challenge', async () => {
      const clientKp = Keypair.random();
      const signedXDR = buildSignedChallenge(clientKp);

      const result = await service.verifyChallengeAndLogin(signedXDR);

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(redis.setex).toHaveBeenCalledWith(
        expect.stringContaining('auth:refresh:'),
        7 * 24 * 60 * 60,
        clientKp.publicKey(),
      );
    });

    it('throws 401 for an invalid / tampered XDR', async () => {
      await expect(
        service.verifyChallengeAndLogin('not-valid-xdr'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws 401 when the nonce has already been used (replay attack)', async () => {
      const clientKp = Keypair.random();
      const signedXDR = buildSignedChallenge(clientKp);

      // First login succeeds
      await service.verifyChallengeAndLogin(signedXDR);

      // Second login with same XDR should be rejected
      await expect(
        service.verifyChallengeAndLogin(signedXDR),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── refreshAccessToken ──────────────────────────────────────────────────

  describe('refreshAccessToken', () => {
    it('returns a new accessToken for a valid refresh token', async () => {
      const clientKp = Keypair.random();
      const signedXDR = buildSignedChallenge(clientKp);
      const { refreshToken } = await service.verifyChallengeAndLogin(signedXDR);

      const result = await service.refreshAccessToken(refreshToken);
      expect(result.accessToken).toBeTruthy();
    });

    it('throws 401 for an unknown refresh token', async () => {
      await expect(
        service.refreshAccessToken('unknown-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('removes the refresh token from Redis', async () => {
      const clientKp = Keypair.random();
      const signedXDR = buildSignedChallenge(clientKp);
      const { refreshToken } = await service.verifyChallengeAndLogin(signedXDR);

      await service.logout(refreshToken);

      // After logout, refresh should fail
      await expect(
        service.refreshAccessToken(refreshToken),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
