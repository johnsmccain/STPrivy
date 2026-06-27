# Noir ZK Circuits

This directory contains standard Noir binary circuits for generating zero-knowledge proofs in the STPrivy zkKYC system. These circuits are **not** Aztec contracts - they are standalone ZK circuits that integrate with the Stellar-based backend.

## Prerequisites

- [nargo](https://noir-lang.org/docs/getting_started) version 1.0.0+
- Rust toolchain for bb.js proof generation (optional, for backend integration)

## Circuit Structure

Each circuit is a standard Noir binary package with:

```
circuit-name/
├── Nargo.toml          # Package configuration (type = "bin")
├── Prover.toml         # Private input values for testing
├── Verifier.toml       # Public input values for verification
└── src/
    └── main.nr         # Circuit logic
```

## Available Circuits

### 1. age-proof
Proves that a subject's age meets or exceeds a threshold without revealing the actual age.

- **Private input**: `age` (u64)
- **Public input**: `threshold` (u64)
- **Logic**: `assert(age >= threshold)`

### 2. residency-proof
Proves that a subject's country is in an allowed list without revealing which country.

- **Private input**: `country_code` ([u8; 2]) - ISO 3166-1 alpha-2
- **Public inputs**: `allowed_countries` ([[u8; 2]; 10]), `allowed_count` (u32)
- **Logic**: Iterates through allowed countries and checks for match

### 3. accredited-investor
Proves that a subject is an accredited investor and is an adult.

- **Private inputs**: `accredited` (bool), `age` (u64)
- **Public inputs**: none
- **Logic**: `assert(accredited == true && age >= 18)`

### 4. sanctions-check
Proves that a subject is not on a sanctions list (simplified hash-based version).

- **Private input**: `sanctions_hash` (Field)
- **Public input**: `clean_list_commitment` (Field)
- **Logic**: `assert(sanctions_hash != clean_list_commitment)`
- **Note**: Full implementation would use Merkle tree inclusion proofs

## Development Workflow

### Check Circuit Syntax
```bash
cd circuits/<circuit-name>
nargo check
```

### Execute Circuit (Generate Witness)
```bash
nargo execute
```
This uses values from `Prover.toml` and `Verifier.toml` to generate a witness at `target/<circuit_name>.gz`.

### Compile to ACIR
```bash
nargo compile
```
Generates ACIR artifact at `target/<circuit_name>.json` for use with bb.js.

### Run Tests
```bash
nargo test
```
Runs all `#[test]` functions in the circuit.

## Integration with Backend

1. **Compilation**: Circuits are pre-compiled with `nargo compile` before deployment
2. **Artifact Loading**: Backend loads `target/<circuit_name>.json` at runtime
3. **Proof Generation**: Backend uses bb.js to generate proofs from witness data
4. **Verification Key**: VK extracted from `target/vk` directory for on-chain verifier contracts

## Deployment

The `contracts/deploy.sh` script automatically:
1. Compiles all circuits
2. Deploys a proof-verifier contract instance for each circuit
3. Initializes each verifier with the corresponding VK from `circuits/<name>/target/vk`

## Testing Values

The `Prover.toml` files contain valid test values that satisfy circuit constraints:

- **age-proof**: age=25, threshold=18 (valid)
- **residency-proof**: country_code=[85,83] (US), allowed_countries includes US
- **accredited-investor**: accredited=true, age=25
- **sanctions-check**: sanctions_hash=123456789, clean_list_commitment=987654321 (different)

Modify these values to test different scenarios or invalid inputs.

## Notes

- All circuits use standard Noir types (no Aztec-specific APIs)
- No contract storage or state management
- Pure functional circuits focused on constraint satisfaction
- Designed for integration with bb.js UltraHonk backend
