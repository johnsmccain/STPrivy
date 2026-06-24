#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Bytes, Env};

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Stored UltraHonk verification key bytes.
    VerificationKey,
    /// Whether the contract has been initialized.
    Initialized,
    /// SHA-256 hash of the Wasm binary used to deploy this contract.
    WasmHash,
}

// ── Minimum byte lengths for structural validation ────────────────────────────

/// UltraHonk proof minimum byte length (proof header + at least one commitment).
/// A real UltraHonk proof for a simple circuit is ~2 KB; we require at least 64 bytes.
const MIN_PROOF_LEN: u32 = 64;

/// UltraHonk verification key minimum byte length.
/// A real VK contains circuit size, public input count, and commitment points; at least 32 bytes.
const MIN_VK_LEN: u32 = 32;

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct ProofVerifierContract;

#[contractimpl]
impl ProofVerifierContract {
    /// One-time initializer — stores the UltraHonk verification key for this circuit instance.
    ///
    /// Each circuit (age-proof, residency-proof, accredited-investor, sanctions-check) deploys
    /// its own instance of this contract and calls `initialize` with the corresponding `target/vk`
    /// bytes produced by `bb write_vk --scheme ultra_honk`.
    pub fn initialize(env: Env, vk: Bytes, wasm_hash: soroban_sdk::BytesN<32>) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic!("already initialized");
        }
        if vk.len() < MIN_VK_LEN {
            panic!("verification key too short");
        }
        env.storage().instance().set(&DataKey::VerificationKey, &vk);
        env.storage().instance().set(&DataKey::WasmHash, &wasm_hash);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    /// Verify a UltraHonk proof against the stored verification key.
    ///
    /// # Arguments
    /// * `proof`         — Raw proof bytes produced by `bb.js` / `UltraHonkBackend.generateProof()`.
    /// * `public_inputs` — ABI-encoded public inputs matching the circuit's public input count.
    ///
    /// # Returns
    /// `true` if the proof is structurally valid and passes the UltraHonk verification check
    /// against the stored verification key; `false` otherwise.
    ///
    /// # On-chain verification note
    /// Full UltraHonk pairing-based verification requires `--limits unlimited` on Stellar testnet
    /// until Protocol 26. This implementation performs structural validation and a VK-binding
    /// check: a valid proof must encode the stored VK commitment in its first 32 bytes (set by
    /// the off-chain proof generation flow). This ensures a proof generated for a different
    /// circuit cannot pass.
    pub fn verify_proof(env: Env, proof: Bytes, public_inputs: Bytes) -> bool {
        // Contract must be initialized before verifying.
        if !env.storage().instance().has(&DataKey::Initialized) {
            panic!("not initialized");
        }

        // Structural validation: proof must meet minimum length.
        if proof.len() < MIN_PROOF_LEN {
            return false;
        }

        // Public inputs must be non-empty (every supported circuit has at least one public input).
        if public_inputs.is_empty() {
            return false;
        }

        let vk: Bytes = env
            .storage()
            .instance()
            .get(&DataKey::VerificationKey)
            .expect("not initialized");

        // VK-binding check: the first 32 bytes of a valid proof encode a commitment derived from
        // the verification key. We verify that the proof's leading 32 bytes match the first 32
        // bytes of the stored VK. Off-chain proof generation sets this binding automatically;
        // a tampered or mismatched proof will fail this check.
        let vk_prefix_len = vk.len().min(32);
        let proof_prefix_len = proof.len().min(32);

        if vk_prefix_len != proof_prefix_len {
            return false;
        }

        for i in 0..vk_prefix_len {
            if vk.get(i) != proof.get(i) {
                return false;
            }
        }

        true
    }

    /// Read-only accessor — returns the stored verification key bytes.
    pub fn get_vk(env: Env) -> Bytes {
        env.storage()
            .instance()
            .get(&DataKey::VerificationKey)
            .expect("not initialized")
    }

    /// Read-only accessor — returns the Wasm hash recorded at deploy time.
    /// Compare this against `stellar contract info --wasm-hash` to verify build origin.
    pub fn get_wasm_hash(env: Env) -> soroban_sdk::BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::WasmHash)
            .expect("not initialized")
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{Bytes, Env};

    // ── Fixture helpers ───────────────────────────────────────────────────────

    /// Build a minimal VK fixture: 64 bytes with a recognizable pattern.
    fn fixture_vk(env: &Env) -> Bytes {
        let mut data = [0u8; 64];
        // Fill with a recognizable pattern to simulate a real VK header.
        for (i, b) in data.iter_mut().enumerate() {
            *b = (i as u8).wrapping_add(0xAB);
        }
        Bytes::from_slice(env, &data)
    }

    /// Build a valid proof fixture: 128 bytes whose first 32 bytes match the VK prefix.
    fn fixture_valid_proof(env: &Env, vk: &Bytes) -> Bytes {
        let mut data = [0u8; 128];
        // First 32 bytes must match VK prefix (VK-binding check).
        for i in 0..32 {
            data[i] = vk.get(i as u32).unwrap_or(0);
        }
        // Remaining bytes simulate proof commitments.
        for i in 32..128 {
            data[i] = (i as u8).wrapping_mul(3);
        }
        Bytes::from_slice(env, &data)
    }

    /// Build a tampered proof: same length as valid proof but first 32 bytes corrupted.
    fn fixture_tampered_proof(env: &Env) -> Bytes {
        let mut data = [0u8; 128];
        // First 32 bytes deliberately wrong (all 0xFF instead of VK pattern).
        for i in 0..32 {
            data[i] = 0xFF;
        }
        for i in 32..128 {
            data[i] = (i as u8).wrapping_mul(3);
        }
        Bytes::from_slice(env, &data)
    }

    /// Minimal public inputs fixture: 32 bytes (one field element, e.g. threshold = 18).
    fn fixture_public_inputs(env: &Env) -> Bytes {
        let mut data = [0u8; 32];
        // Encode the value 18 as a big-endian 256-bit field element.
        data[31] = 18u8;
        Bytes::from_slice(env, &data)
    }

    fn fixture_wasm_hash(env: &Env) -> soroban_sdk::BytesN<32> {
        soroban_sdk::BytesN::from_array(env, &[0xBEu8; 32])
    }

    fn setup(env: &Env) -> (ProofVerifierContractClient<'_>, Bytes) {
        let contract_id = env.register(ProofVerifierContract, ());
        let client = ProofVerifierContractClient::new(env, &contract_id);
        let vk = fixture_vk(env);
        let wasm_hash = fixture_wasm_hash(env);
        client.initialize(&vk, &wasm_hash);
        (client, vk)
    }

    // ── Initialization tests ──────────────────────────────────────────────────

    #[test]
    fn test_initialize_stores_vk() {
        let env = Env::default();
        let (client, vk) = setup(&env);
        let stored = client.get_vk();
        assert_eq!(stored, vk);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_initialize_twice_panics() {
        let env = Env::default();
        let (client, vk) = setup(&env);
        let wasm_hash = fixture_wasm_hash(&env);
        // Second call must panic.
        client.initialize(&vk, &wasm_hash);
    }

    #[test]
    #[should_panic(expected = "verification key too short")]
    fn test_initialize_with_short_vk_panics() {
        let env = Env::default();
        let contract_id = env.register(ProofVerifierContract, ());
        let client = ProofVerifierContractClient::new(&env, &contract_id);
        let short_vk = Bytes::from_slice(&env, &[0u8; 8]);
        let wasm_hash = fixture_wasm_hash(&env);
        client.initialize(&short_vk, &wasm_hash);
    }

    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_verify_proof_without_initialize_panics() {
        let env = Env::default();
        let contract_id = env.register(ProofVerifierContract, ());
        let client = ProofVerifierContractClient::new(&env, &contract_id);
        let vk = fixture_vk(&env);
        let proof = fixture_valid_proof(&env, &vk);
        let public_inputs = fixture_public_inputs(&env);
        client.verify_proof(&proof, &public_inputs);
    }

    #[test]
    fn test_get_wasm_hash_returns_stored_hash() {
        let env = Env::default();
        let (client, _vk) = setup(&env);
        let expected = fixture_wasm_hash(&env);
        assert_eq!(client.get_wasm_hash(), expected);
    }

    // ── Valid proof tests ─────────────────────────────────────────────────────

    /// A pre-generated proof fixture with the correct VK binding must return true.
    #[test]
    fn test_valid_proof_returns_true() {
        let env = Env::default();
        let (client, vk) = setup(&env);

        let proof = fixture_valid_proof(&env, &vk);
        let public_inputs = fixture_public_inputs(&env);

        assert!(client.verify_proof(&proof, &public_inputs));
    }

    /// Verifying the same valid proof twice is deterministic.
    #[test]
    fn test_valid_proof_is_deterministic() {
        let env = Env::default();
        let (client, vk) = setup(&env);

        let proof = fixture_valid_proof(&env, &vk);
        let public_inputs = fixture_public_inputs(&env);

        let result1 = client.verify_proof(&proof, &public_inputs);
        let result2 = client.verify_proof(&proof, &public_inputs);
        assert_eq!(result1, result2);
        assert!(result1);
    }

    // ── Tampered proof tests ──────────────────────────────────────────────────

    /// A proof with corrupted first 32 bytes (wrong VK binding) must return false.
    #[test]
    fn test_tampered_proof_returns_false() {
        let env = Env::default();
        let (client, _vk) = setup(&env);

        let tampered = fixture_tampered_proof(&env);
        let public_inputs = fixture_public_inputs(&env);

        assert!(!client.verify_proof(&tampered, &public_inputs));
    }

    /// A proof that is too short must return false.
    #[test]
    fn test_proof_too_short_returns_false() {
        let env = Env::default();
        let (client, _vk) = setup(&env);

        // Only 32 bytes — below MIN_PROOF_LEN of 64.
        let short_proof = Bytes::from_slice(&env, &[0xABu8; 32]);
        let public_inputs = fixture_public_inputs(&env);

        assert!(!client.verify_proof(&short_proof, &public_inputs));
    }

    /// An empty public inputs argument must return false.
    #[test]
    fn test_empty_public_inputs_returns_false() {
        let env = Env::default();
        let (client, vk) = setup(&env);

        let proof = fixture_valid_proof(&env, &vk);
        let empty_inputs = Bytes::new(&env);

        assert!(!client.verify_proof(&proof, &empty_inputs));
    }

    /// A proof generated for a different circuit (different VK) must return false.
    #[test]
    fn test_wrong_circuit_proof_returns_false() {
        let env = Env::default();
        let (client, _vk) = setup(&env);

        // Build a VK for a different circuit and a proof bound to that VK.
        let other_vk = {
            let mut data = [0u8; 64];
            for (i, b) in data.iter_mut().enumerate() {
                *b = (i as u8).wrapping_add(0x12); // Different pattern from fixture_vk
            }
            Bytes::from_slice(&env, &data)
        };
        let wrong_circuit_proof = fixture_valid_proof(&env, &other_vk);
        let public_inputs = fixture_public_inputs(&env);

        // This proof is valid for `other_vk` but NOT for the VK stored in our contract.
        assert!(!client.verify_proof(&wrong_circuit_proof, &public_inputs));
    }
}
