#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env};

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Revocation(BytesN<32>),
    WasmHash,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct RevocationRegistryContract;

#[contractimpl]
impl RevocationRegistryContract {
    /// One-time initializer — sets the admin (issuer service) address.
    pub fn initialize(env: Env, admin: Address, wasm_hash: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::WasmHash, &wasm_hash);
    }

    /// Revoke a credential by its hash. Issuer (admin) auth required.
    /// Stores the ledger timestamp at the time of revocation.
    pub fn revoke_credential(env: Env, credential_hash: BytesN<32>) {
        let admin = Self::get_admin(&env);
        admin.require_auth();

        let timestamp = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&DataKey::Revocation(credential_hash), &timestamp);
    }

    /// Read-only check — returns true if the credential hash has been revoked.
    pub fn is_revoked(env: Env, credential_hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Revocation(credential_hash))
    }

    /// Read-only accessor — returns the Wasm hash recorded at deploy time.
    pub fn get_wasm_hash(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::WasmHash)
            .expect("not initialized")
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    fn get_admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Admin)
            .expect("not initialized")
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, MockAuth, MockAuthInvoke},
        vec, BytesN, Env, IntoVal,
    };

    fn setup() -> (Env, RevocationRegistryContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RevocationRegistryContract, ());
        let client = RevocationRegistryContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let wasm_hash = BytesN::from_array(&env, &[0xBEu8; 32]);
        client.initialize(&admin, &wasm_hash);

        (env, client, admin)
    }

    fn random_hash(env: &Env) -> BytesN<32> {
        let bytes: [u8; 32] = [42u8; 32];
        BytesN::from_array(env, &bytes)
    }

    fn another_hash(env: &Env) -> BytesN<32> {
        let bytes: [u8; 32] = [99u8; 32];
        BytesN::from_array(env, &bytes)
    }

    /// revoke_credential → is_revoked returns true
    #[test]
    fn test_revoke_then_is_revoked_true() {
        let (env, client, _admin) = setup();
        let hash = random_hash(&env);

        client.revoke_credential(&hash);

        assert!(client.is_revoked(&hash));
    }

    /// credential never revoked → is_revoked returns false
    #[test]
    fn test_unrevoked_credential_is_not_revoked() {
        let (env, client, _admin) = setup();
        let hash = random_hash(&env);

        assert!(!client.is_revoked(&hash));
    }

    /// revoking one credential does not affect another
    #[test]
    fn test_revoke_one_does_not_affect_other() {
        let (env, client, _admin) = setup();
        let hash1 = random_hash(&env);
        let hash2 = another_hash(&env);

        client.revoke_credential(&hash1);

        assert!(client.is_revoked(&hash1));
        assert!(!client.is_revoked(&hash2));
    }

    /// revoking an already-revoked credential is idempotent
    #[test]
    fn test_revoke_twice_is_idempotent() {
        let (env, client, _admin) = setup();
        let hash = random_hash(&env);

        client.revoke_credential(&hash);
        client.revoke_credential(&hash);

        assert!(client.is_revoked(&hash));
    }

    /// calling revoke_credential before initialize should panic
    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_revoke_without_initialize_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(RevocationRegistryContract, ());
        let client = RevocationRegistryContractClient::new(&env, &contract_id);

        let hash = random_hash(&env);
        client.revoke_credential(&hash);
    }

    /// A non-admin caller must not be able to revoke a credential.
    #[test]
    #[should_panic]
    fn test_non_admin_cannot_revoke() {
        let env = Env::default();

        let contract_id = env.register(RevocationRegistryContract, ());
        let client = RevocationRegistryContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let attacker = Address::generate(&env);

        // Initialize — mock admin auth for this call only
        env.mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: vec![&env, admin.into_val(&env)].into(),
                sub_invokes: &[],
            },
        }]);
        client.initialize(&admin, &BytesN::from_array(&env, &[0xBEu8; 32]));

        // Try to revoke but only mock attacker's auth — admin auth NOT provided
        let hash = random_hash(&env);
        env.mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "revoke_credential",
                args: vec![&env, hash.into_val(&env)].into(),
                sub_invokes: &[],
            },
        }]);
        // admin.require_auth() will not be satisfied → panic
        client.revoke_credential(&hash);
    }

    #[test]
    fn test_get_wasm_hash_returns_stored_hash() {
        let (env, client, _admin) = setup();
        let expected = BytesN::from_array(&env, &[0xBEu8; 32]);
        assert_eq!(client.get_wasm_hash(), expected);
    }
}
