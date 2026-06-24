# zkKYC Soroban Contracts

Reference guide for the three Soroban smart contracts deployed on Stellar testnet. Covers each contract's interface, the end-to-end interaction flow, and copy-paste CLI examples.

---

## Deployed Addresses (Testnet)

| Contract | ID |
|---|---|
| `issuer-registry` | `CANCMXEGGKETATRNH7MSAQZTJ3M3IG4D6NZPYYF5BVWWYR6PZS46TA7T` |
| `revocation-registry` | `CBV6NUS4XGRIOLWK37VG4SBP7OR4FLW3H4NTZGPNC4DPYZVNMJ37KSDF` |
| `proof-verifier` (age-proof) | `CC4PCG66IJW6YJYVVY2TRC3ZHZA46BHPB6MVXE2URGZ6XE4G7W6DVP7U` |

Admin / deployer address: `GCAQEL7ANLE3FEHJCKBDBNQNP62XW2TOGPMWQM2XCF5BULXWNFY65AV5`

> Additional proof-verifier instances (residency-proof, accredited-investor, sanctions-check) are deployed when those circuits are compiled in tasks 11.2–11.4.

---

## Test Accounts (Stellar Testnet)

All accounts below are funded via Friendbot and ready to use. These are **testnet-only** accounts — do not send real XLM to these addresses.

> **Security note:** These keys are for testnet development and testing only. Never use testnet keys on mainnet.

### Deployer / Admin

The contract admin. Controls issuer-registry and revocation-registry. Used as `STELLAR_SERVER_SECRET` in `.env`.

| Field | Value |
|---|---|
| Role | Admin / Contract deployer |
| Public key | `GCAQEL7ANLE3FEHJCKBDBNQNP62XW2TOGPMWQM2XCF5BULXWNFY65AV5` |
| Secret key | `SDRQDINAQZMQV55XMYX77WRYMTOBMTJLSFSYITXP6XL5C3PDYMOKATQK` |
| DID | `did:stellar:GCAQEL7ANLE3FEHJCKBDBNQNP62XW2TOGPMWQM2XCF5BULXWNFY65AV5` |
| Explorer | https://stellar.expert/explorer/testnet/account/GCAQEL7ANLE3FEHJCKBDBNQNP62XW2TOGPMWQM2XCF5BULXWNFY65AV5 |

### Issuer

A registered KYC provider. Already added to the issuer-registry contract with name `"Test KYC Issuer"`.

| Field | Value |
|---|---|
| Role | KYC Issuer |
| Public key | `GDFIG4YYAMBOKJ2RGXGYXGZKEOGLBOB5GP6RURA6MPNNH2BPF27S2UQV` |
| Secret key | `SDHAHLWOFUUYKLFLUGCBYDLNILHPWHBHUWGLOFWTB5EZ4ENWOXTXS73E` |
| DID | `did:stellar:GDFIG4YYAMBOKJ2RGXGYXGZKEOGLBOB5GP6RURA6MPNNH2BPF27S2UQV` |
| Registry status | ✅ Active (`is_issuer` returns `true`) |
| Explorer | https://stellar.expert/explorer/testnet/account/GDFIG4YYAMBOKJ2RGXGYXGZKEOGLBOB5GP6RURA6MPNNH2BPF27S2UQV |

### Subject

The end user who holds credentials and generates ZK proofs.

| Field | Value |
|---|---|
| Role | Credential holder / Proof generator |
| Public key | `GAUW7VXED5YFOHX2HNEVR4ZHUIU6OMU3HE6NJ7HCRB3ADUKJ5H3QASA2` |
| Secret key | `SBVAB3HZH3XL5XARTSRQ3GUCEGIQL43CXXHPDM3TKA47LYOI64YEOQ7D` |
| DID | `did:stellar:GAUW7VXED5YFOHX2HNEVR4ZHUIU6OMU3HE6NJ7HCRB3ADUKJ5H3QASA2` |
| Explorer | https://stellar.expert/explorer/testnet/account/GAUW7VXED5YFOHX2HNEVR4ZHUIU6OMU3HE6NJ7HCRB3ADUKJ5H3QASA2 |

### Verifier

A DeFi protocol or dApp that requests and validates ZK proofs.

| Field | Value |
|---|---|
| Role | Proof verifier / Policy evaluator |
| Public key | `GDYTEGNEBVSWDEFW72YM4MAZRKA2IEFPZFSLXMCNXPU4QSKYKJTFKCMG` |
| Secret key | `SDKH3A7E4YK37ZTIMCW5RUCTENN4PQV5LTCTGYP5H2CPNWMSD3KUXLPD` |
| DID | `did:stellar:GDYTEGNEBVSWDEFW72YM4MAZRKA2IEFPZFSLXMCNXPU4QSKYKJTFKCMG` |
| Explorer | https://stellar.expert/explorer/testnet/account/GDYTEGNEBVSWDEFW72YM4MAZRKA2IEFPZFSLXMCNXPU4QSKYKJTFKCMG |

### Quick reference

```bash
# Deployer
DEPLOYER_PUBLIC=GCAQEL7ANLE3FEHJCKBDBNQNP62XW2TOGPMWQM2XCF5BULXWNFY65AV5
DEPLOYER_SECRET=SDRQDINAQZMQV55XMYX77WRYMTOBMTJLSFSYITXP6XL5C3PDYMOKATQK

# Issuer (already registered on issuer-registry)
ISSUER_PUBLIC=GDFIG4YYAMBOKJ2RGXGYXGZKEOGLBOB5GP6RURA6MPNNH2BPF27S2UQV
ISSUER_SECRET=SDHAHLWOFUUYKLFLUGCBYDLNILHPWHBHUWGLOFWTB5EZ4ENWOXTXS73E

# Subject
SUBJECT_PUBLIC=GAUW7VXED5YFOHX2HNEVR4ZHUIU6OMU3HE6NJ7HCRB3ADUKJ5H3QASA2
SUBJECT_SECRET=SBVAB3HZH3XL5XARTSRQ3GUCEGIQL43CXXHPDM3TKA47LYOI64YEOQ7D

# Verifier
VERIFIER_PUBLIC=GDYTEGNEBVSWDEFW72YM4MAZRKA2IEFPZFSLXMCNXPU4QSKYKJTFKCMG
VERIFIER_SECRET=SDKH3A7E4YK37ZTIMCW5RUCTENN4PQV5LTCTGYP5H2CPNWMSD3KUXLPD
```

### Load accounts into Stellar CLI

```bash
echo "SDRQDINAQZMQV55XMYX77WRYMTOBMTJLSFSYITXP6XL5C3PDYMOKATQK" | stellar keys add deployer --secret-key
echo "SDHAHLWOFUUYKLFLUGCBYDLNILHPWHBHUWGLOFWTB5EZ4ENWOXTXS73E" | stellar keys add issuer --secret-key
echo "SBVAB3HZH3XL5XARTSRQ3GUCEGIQL43CXXHPDM3TKA47LYOI64YEOQ7D" | stellar keys add subject --secret-key
echo "SDKH3A7E4YK37ZTIMCW5RUCTENN4PQV5LTCTGYP5H2CPNWMSD3KUXLPD" | stellar keys add verifier --secret-key
```

### Re-fund accounts (if XLM runs low)

```bash
for addr in \
  GCAQEL7ANLE3FEHJCKBDBNQNP62XW2TOGPMWQM2XCF5BULXWNFY65AV5 \
  GDFIG4YYAMBOKJ2RGXGYXGZKEOGLBOB5GP6RURA6MPNNH2BPF27S2UQV \
  GAUW7VXED5YFOHX2HNEVR4ZHUIU6OMU3HE6NJ7HCRB3ADUKJ5H3QASA2 \
  GDYTEGNEBVSWDEFW72YM4MAZRKA2IEFPZFSLXMCNXPU4QSKYKJTFKCMG; do
  curl -s "https://friendbot.stellar.org?addr=$addr" | python3 -c \
    "import json,sys; r=json.load(sys.stdin); print('funded:', r.get('hash','')[:20] or r.get('detail',''))"
done
```

---

## Prerequisites

```bash
# Stellar CLI v27+
stellar --version

# Add testnet network config (one-time)
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# Import or generate a keypair
stellar keys generate my-key --network testnet   # generates + funds via Friendbot
# or import an existing secret key:
echo "SXXX..." | stellar keys add my-key --secret-key
```

---

## Contract 1 — Issuer Registry

Maintains the set of trusted KYC issuer addresses on-chain. Only the admin (set at `initialize`) can add or remove issuers. Anyone can query `is_issuer`.

### Functions

| Function | Auth required | Description |
|---|---|---|
| `initialize(admin)` | none (one-time) | Sets the admin address. Panics if called twice. |
| `add_issuer(issuer, name)` | admin | Registers an issuer address with a display name. |
| `remove_issuer(issuer)` | admin | Deactivates an issuer (sets `active = false`). |
| `is_issuer(issuer)` | none | Returns `true` if the address is an active issuer. |

### CLI Examples

```bash
ISSUER_REGISTRY=CANCMXEGGKETATRNH7MSAQZTJ3M3IG4D6NZPYYF5BVWWYR6PZS46TA7T

# Register a new KYC issuer (admin only)
stellar contract invoke \
  --id $ISSUER_REGISTRY \
  --source deployer \
  --network testnet \
  -- add_issuer \
  --issuer GBISSUERADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX \
  --name "Acme KYC Ltd"

# Check if an address is a registered issuer (read-only, no fee)
stellar contract invoke \
  --id $ISSUER_REGISTRY \
  --source deployer \
  --network testnet \
  -- is_issuer \
  --issuer GBISSUERADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Deactivate an issuer
stellar contract invoke \
  --id $ISSUER_REGISTRY \
  --source deployer \
  --network testnet \
  -- remove_issuer \
  --issuer GBISSUERADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Behaviour notes

- `add_issuer` on an already-registered address updates the name and keeps it active (idempotent re-registration).
- `remove_issuer` on an unknown address is a no-op (no panic).
- `is_issuer` returns `false` for any address that was never added or has been removed.

---

## Contract 2 — Revocation Registry

Tracks revoked credential hashes. The admin (issuer service) calls `revoke_credential`; anyone can query `is_revoked`. Stores the ledger timestamp at the moment of revocation.

### Functions

| Function | Auth required | Description |
|---|---|---|
| `initialize(admin)` | none (one-time) | Sets the admin address. Panics if called twice. |
| `revoke_credential(credential_hash)` | admin | Marks a 32-byte credential hash as revoked. |
| `is_revoked(credential_hash)` | none | Returns `true` if the hash has been revoked. |

### CLI Examples

```bash
REVOCATION_REGISTRY=CBV6NUS4XGRIOLWK37VG4SBP7OR4FLW3H4NTZGPNC4DPYZVNMJ37KSDF

# Revoke a credential by its SHA-256 hash (hex-encoded, 32 bytes = 64 hex chars)
CRED_HASH="a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9"

stellar contract invoke \
  --id $REVOCATION_REGISTRY \
  --source deployer \
  --network testnet \
  -- revoke_credential \
  --credential_hash "$CRED_HASH"

# Query revocation status (read-only)
stellar contract invoke \
  --id $REVOCATION_REGISTRY \
  --source deployer \
  --network testnet \
  -- is_revoked \
  --credential_hash "$CRED_HASH"
```

### Behaviour notes

- `revoke_credential` is idempotent — revoking an already-revoked hash overwrites the timestamp but does not panic.
- The credential hash stored here is the same `SHA-256(JSON.stringify(sortedClaims + issuerId + subjectDID + issuedAt))` value computed by `CredentialService` and stored in the `Credential.credentialHash` DB column.
- No PII is stored — only the 32-byte hash.

---

## Contract 3 — Proof Verifier

One instance per ZK circuit. Initialized with the circuit's UltraHonk verification key (produced by `bb write_vk`). Verifies proof artifacts submitted from the off-chain proof worker.

### Functions

| Function | Auth required | Description |
|---|---|---|
| `initialize(vk)` | none (one-time) | Stores the verification key bytes. Panics if VK < 32 bytes or called twice. |
| `verify_proof(proof, public_inputs)` | none | Returns `true` if the proof passes VK-binding and structural checks. |
| `get_vk()` | none | Returns the stored verification key bytes. |

### CLI Examples

```bash
PROOF_VERIFIER_AGE=CC4PCG66IJW6YJYVVY2TRC3ZHZA46BHPB6MVXE2URGZ6XE4G7W6DVP7U

# Read back the stored VK to confirm initialization
stellar contract invoke \
  --id $PROOF_VERIFIER_AGE \
  --source deployer \
  --network testnet \
  -- get_vk

# Verify a proof (proof and public_inputs are hex strings)
# These are generated by the ProofGenerationWorker via bb.js
PROOF_HEX="<hex bytes of proof artifact from ZKProof.artifact>"
PUBLIC_INPUTS_HEX="<hex bytes of ABI-encoded public inputs>"

stellar contract invoke \
  --id $PROOF_VERIFIER_AGE \
  --source deployer \
  --network testnet \
  -- verify_proof \
  --proof "$PROOF_HEX" \
  --public_inputs "$PUBLIC_INPUTS_HEX"
```

### Deploying a new circuit verifier instance

Each circuit needs its own contract instance initialized with that circuit's VK:

```bash
# 1. Build contracts
stellar contract build   # from contracts/

# 2. Deploy a fresh proof-verifier instance
stellar contract deploy \
  --wasm target/wasm32v1-none/release/proof_verifier.wasm \
  --source deployer \
  --network testnet
# → outputs CONTRACT_ID

# 3. Read the VK for the circuit (e.g. residency-proof)
VK_HEX=$(xxd -p circuits/residency-proof/target/vk/vk | tr -d '\n')

# 4. Initialize with the VK
stellar contract invoke \
  --id $CONTRACT_ID \
  --source deployer \
  --network testnet \
  -- initialize \
  --vk "$VK_HEX"
```

### Behaviour notes

- `verify_proof` returns `false` (not panic) for: proof shorter than 64 bytes, empty public inputs, or a proof whose first 32 bytes don't match the stored VK prefix.
- A proof generated for a different circuit will fail the VK-binding check and return `false`.
- Full UltraHonk pairing verification requires `--limits unlimited` on testnet until Stellar Protocol 26.

---

## End-to-End Flow

This is the full lifecycle from onboarding an issuer to verifying a ZK proof on-chain.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Step 1 — Admin registers a KYC issuer                                  │
│                                                                         │
│  POST /issuers (admin JWT)                                              │
│    → DB: insert Issuer record                                           │
│    → SorobanService: invokeContract('issuer-registry', 'add_issuer')   │
│    → issuer-registry contract: stores IssuerRecord{name, active:true}  │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────┐
│  Step 2 — Issuer issues a W3C Verifiable Credential                     │
│                                                                         │
│  POST /credentials (issuer JWT)                                         │
│    → SorobanService: simulateContract('issuer-registry', 'is_issuer')  │
│    → issuer-registry: returns true                                      │
│    → CredentialService: build VC, sign Ed25519Signature2020             │
│    → SHA-256(claims + meta) → credentialHash                           │
│    → DB: insert Credential{credentialHash, onChainTxHash}               │
│    → SorobanService: invokeContract('credential-registry',              │
│                                     'issue_credential')                 │
│    → emit CredentialIssued event                                        │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────┐
│  Step 3 — Subject generates a ZK proof                                  │
│                                                                         │
│  POST /proofs/generate (subject JWT)                                    │
│    → validate credential ownership + not revoked                        │
│    → BullMQ: enqueue proof-generation job → return { jobId }           │
│                                                                         │
│  [Worker]                                                               │
│    → load circuits/age-proof/target/age_proof.json                     │
│    → Noir.execute({age: <private>, threshold: <public>}) → witness     │
│    → UltraHonkBackend.generateProof(witness) → {proof, publicInputs}  │
│    → DB: ZKProof.status = COMPLETED, artifact = {proof, publicInputs}  │
│    → emit ProofGenerated event                                          │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────┐
│  Step 4 — Verifier verifies the proof on-chain                          │
│                                                                         │
│  POST /proofs/verify (verifier JWT)                                     │
│    → load ZKProof.artifact from DB                                      │
│    → UltraHonkBackend.verifyProof(proof) — local check                 │
│    → if valid: SorobanService.invokeContract(                           │
│                  'proof-verifier-age-proof', 'verify_proof',            │
│                  [proofBytes, publicInputsBytes])                       │
│    → proof-verifier contract: VK-binding check → returns true/false    │
│    → DB: persist ProofVerification{result, onChainTxHash}               │
│    → emit ProofVerified event                                           │
│    → return { valid: true, txHash } or { valid: false, reason }        │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────────┐
│  Step 5 — (Optional) Issuer revokes a credential                        │
│                                                                         │
│  POST /revocations (issuer JWT)                                         │
│    → verify issuer owns the credential (403 if mismatch)               │
│    → DB: Credential.status = REVOKED                                    │
│    → SorobanService: invokeContract('revocation-registry',              │
│                                     'revoke_credential', [hash])       │
│    → revocation-registry: stores {hash → ledger timestamp}             │
│    → emit CredentialRevoked event                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Useful Queries

### Check issuer registry state via Stellar Lab

Open in browser:

```
https://lab.stellar.org/r/testnet/contract/CANCMXEGGKETATRNH7MSAQZTJ3M3IG4D6NZPYYF5BVWWYR6PZS46TA7T
```

### Compute a credential hash (Node.js)

```javascript
import { createHash } from 'crypto';

function credentialHash(claims, issuerId, subjectDID, issuedAt) {
  const payload = JSON.stringify(
    Object.entries({ ...claims, issuerId, subjectDID, issuedAt })
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {})
  );
  return createHash('sha256').update(payload).digest('hex');
}

// Example
const hash = credentialHash(
  { age: 25, country: 'US', accredited: true },
  'did:stellar:GBISSUER...',
  'did:stellar:GBSUBJECT...',
  '2026-06-23T00:00:00Z'
);
console.log(hash); // 64-char hex string used as credential_hash on-chain
```

### Poll a BullMQ job status

```bash
curl -H "Authorization: Bearer $JWT" \
  https://api.example.com/proofs/jobs/<jobId>
# → { "status": "completed" | "active" | "waiting" | "failed" }
```

---

## Re-deploying Contracts

If you need to redeploy (e.g. after a contract upgrade), update `.env` with the new contract IDs:

```bash
# Build
stellar contract build   # from contracts/

# Deploy + initialize each contract (see individual sections above for init args)
stellar contract deploy --wasm target/wasm32v1-none/release/issuer_registry.wasm \
  --source deployer --network testnet

stellar contract deploy --wasm target/wasm32v1-none/release/revocation_registry.wasm \
  --source deployer --network testnet

stellar contract deploy --wasm target/wasm32v1-none/release/proof_verifier.wasm \
  --source deployer --network testnet
```

Then update `.env`:

```dotenv
ISSUER_REGISTRY_CONTRACT_ID=<new ID>
REVOCATION_REGISTRY_CONTRACT_ID=<new ID>
PROOF_VERIFIER_CONTRACT_ID_AGE_PROOF=<new ID>
```
