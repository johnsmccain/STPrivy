import { Injectable, Logger } from '@nestjs/common';
import { SorobanService } from '../soroban/soroban.service';
import { nativeToScVal } from '@stellar/stellar-sdk';

/**
 * IssuerService — checks whether an issuer address is registered on-chain.
 * Full implementation (register/deregister) is in task 7.2.
 */
@Injectable()
export class IssuerService {
  private readonly logger = new Logger(IssuerService.name);

  constructor(private readonly sorobanService: SorobanService) {}

  /**
   * Returns true if the given Stellar address is an active issuer on-chain.
   * Calls the issuer-registry contract's is_issuer function via simulation.
   * Requirement: 9.3
   */
  async isRegistered(stellarAddress: string): Promise<boolean> {
    try {
      const result = await this.sorobanService.simulateContract(
        'issuer-registry',
        'is_issuer',
        [nativeToScVal(stellarAddress, { type: 'address' })],
      );
      // The simulation result value is a ScVal bool
      const returnVal = result.result?.retval;
      if (!returnVal) return false;
      return returnVal.switch().name === 'scvBool' && returnVal.b();
    } catch (err) {
      this.logger.error(
        `isRegistered check failed for ${stellarAddress}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
