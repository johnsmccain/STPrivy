export interface KYCClaims {
  country: string;  // ISO 3166-1 alpha-2
  age: number;      // integer years
  accredited: boolean;
}

export interface VerificationMethodJwk {
  id: string;
  type: 'JsonWebKey2020';
  controller: string;
  publicKeyJwk: {
    kty: string;
    crv: string;
    x: string;
  };
}

export interface VCProof {
  type: 'Ed25519Signature2020';
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  proofValue: string; // base64url-encoded signature
}

export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: {
    id: string;
    [key: string]: unknown;
  };
  proof: VCProof;
}

export interface VerificationResult {
  valid: boolean;
  reason?: 'invalid_signature' | 'revoked' | 'expired' | 'unknown';
}
