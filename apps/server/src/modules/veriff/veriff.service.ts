import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { CredentialService } from '../credentials/credential.service';

interface VeriffSessionResponse {
  status: string;
  verification: { id: string; url: string; sessionToken: string };
}

export interface VeriffWebhookPayload {
  id: string;
  attemptId?: string;
  code?: number;
  action?: string;
  vendorData?: string;
  verification?: {
    status: string;
    person?: { firstName?: string; lastName?: string; dateOfBirth?: string };
    document?: { country?: string };
    reason?: string;
  };
}

@Injectable()
export class VeriffService {
  private readonly logger = new Logger(VeriffService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly credentialService: CredentialService,
  ) {
    this.apiKey = this.config.get<string>('VERIFF_API_KEY', '');
    this.apiSecret = this.config.get<string>('VERIFF_API_SECRET', '');
    this.baseUrl = this.config.get<string>('VERIFF_BASE_URL', 'https://stationapi.veriff.com');
  }

  async createSession(userId: string): Promise<{ sessionId: string; sessionUrl: string; sessionToken: string }> {
    // If no API key is configured, return a mock session for development
    if (!this.apiKey || this.apiKey === 'your_veriff_api_key') {
      this.logger.warn('Veriff API key not configured, returning mock session for development');
      const mockSessionId = `mock-${userId}-${Date.now()}`;
      const mockSessionUrl = 'https://veriff.com';
      const mockSessionToken = 'mock_token';
      
      await this.prisma.veriffSession.create({
        data: { userId, sessionId: mockSessionId, sessionUrl: mockSessionUrl, status: 'approved' },
      });
      
      return { sessionId: mockSessionId, sessionUrl: mockSessionUrl, sessionToken: mockSessionToken };
    }

    const body = {
      verification: {
        vendorData: userId,
        timestamp: new Date().toISOString(),
      },
    };

    const res = await fetch(`${this.baseUrl}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AUTH-CLIENT': this.apiKey },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Veriff createSession failed: ${err}`);
      throw new BadRequestException('Failed to create Veriff session');
    }

    const data = (await res.json()) as VeriffSessionResponse;
    const { id: sessionId, url: sessionUrl, sessionToken } = data.verification;

    await this.prisma.veriffSession.create({
      data: { userId, sessionId, sessionUrl, status: 'created' },
    });

    return { sessionId, sessionUrl, sessionToken };
  }

  async getSession(sessionId: string, userId: string) {
    const session = await this.prisma.veriffSession.findUnique({ where: { sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new UnauthorizedException();
    return session;
  }

  async handleWebhook(payload: VeriffWebhookPayload, signature: string, rawBody: string): Promise<void> {
    if (this.apiSecret) {
      const expected = createHmac('sha256', this.apiSecret).update(rawBody).digest('hex');
      if (signature !== expected) {
        this.logger.warn('Veriff webhook signature mismatch');
        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    const sessionId = payload.id;
    const status = payload.verification?.status ?? 'unknown';

    const session = await this.prisma.veriffSession.findUnique({ where: { sessionId } });
    if (!session) {
      this.logger.warn(`Veriff webhook for unknown session: ${sessionId}`);
      return;
    }

    await this.prisma.veriffSession.update({ where: { sessionId }, data: { status } });

    if (status !== 'approved') {
      this.logger.log(`Veriff session ${sessionId} status updated: ${status}`);
      return;
    }

    try {
      await this.issueCredentialFromVeriff(session.userId, sessionId, payload);
    } catch (err) {
      this.logger.error(`VC issuance failed for session ${sessionId}: ${(err as Error).message}`);
    }
  }

  private async issueCredentialFromVeriff(
    userId: string,
    sessionId: string,
    payload: VeriffWebhookPayload,
  ): Promise<void> {
    const did = await this.prisma.dID.findUnique({ where: { userId } });
    if (!did) {
      this.logger.warn(`No DID for user ${userId}, skipping VC issuance`);
      return;
    }

    const country = (payload.verification?.document?.country ?? 'XX').slice(0, 2).toUpperCase();
    const dob = payload.verification?.person?.dateOfBirth;
    const age = dob ? this.calculateAge(dob) : 18;

    const serverSecret = this.config.get<string>('STELLAR_SERVER_SECRET')!;
    const issuerAddress = Keypair.fromSecret(serverSecret).publicKey();
    const issuerDID = `did:stellar:${issuerAddress}`;

    await this.prisma.issuer.upsert({
      where: { stellarAddress: issuerAddress },
      create: { did: issuerDID, stellarAddress: issuerAddress, name: 'STPrivy KYC Service', active: true },
      update: { active: true },
    });

    const vc = await this.credentialService.issueCredential(issuerDID, did.id, { country, age, accredited: false });
    const credentialId = (vc.id as string).replace('urn:uuid:', '');

    await this.prisma.veriffSession.update({ where: { sessionId }, data: { credentialId } });
    this.logger.log(`VC issued for Veriff session ${sessionId}: ${credentialId}`);
  }

  private calculateAge(dateOfBirth: string): number {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return Math.max(0, age);
  }
}
