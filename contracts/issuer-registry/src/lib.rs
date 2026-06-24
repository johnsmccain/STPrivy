#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, String};

// ── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Issuer(Address),
    WasmHash,
}

// ── Data types ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct IssuerRecord {
    pub name: String,
    pub active: bool,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct IssuerRegistryContract;

#[contractimpl]
impl IssuerRegistryContract {
    /// One-time initializer — sets the admin address.
    pub fn initialize(env: Env, admin: Address, wasm_hash: BytesN<32>) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::WasmHash, &wasm_hash);
    }

    /// Register a new issuer. Admin auth required.
    pub fn add_issuer(env: Env, issuer: Address, name: String) {
        let admin = Self::get_admin(&env);
        admin.require_auth();

        let record = IssuerRecord {
            name,
            active: true,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Issuer(issuer), &record);
    }

    /// Remove (deactivate) an issuer. Admin auth required.
    pub fn remove_issuer(env: Env, issuer: Address) {
        let admin = Self::get_admin(&env);
        admin.require_auth();

        if let Some(mut record) = env
            .storage()
            .persistent()
            .get::<DataKey, IssuerRecord>(&DataKey::Issuer(issuer.clone()))
        {
            record.active = false;
            env.storage()
                .persistent()
                .set(&DataKey::Issuer(issuer), &record);
        }
    }

    /// Read-only check — returns true if the address is an active issuer.
    pub fn is_issuer(env: Env, issuer: Address) -> bool {
        env.storage()
            .persistent()
            .get::<DataKey, IssuerRecord>(&DataKey::Issuer(issuer))
            .map(|r| r.active)
            .unwrap_or(false)
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
        vec, BytesN, Env, IntoVal, String,
    };

    fn fixture_wasm_hash(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[0xBEu8; 32])
    }

    fn setup() -> (Env, IssuerRegistryContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(IssuerRegistryContract, ());
        let client = IssuerRegistryContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let wasm_hash = fixture_wasm_hash(&env);
        client.initialize(&admin, &wasm_hash);

        (env, client, admin)
    }

    /// add_issuer → is_issuer returns true
    #[test]
    fn test_add_then_is_issuer_true() {
        let (env, client, _admin) = setup();
        let issuer = Address::generate(&env);
        let name = String::from_str(&env, "Acme KYC");

        client.add_issuer(&issuer, &name);

        assert!(client.is_issuer(&issuer));
    }

    /// add then remove → is_issuer returns false
    #[test]
    fn test_remove_then_is_issuer_false() {
        let (env, client, _admin) = setup();
        let issuer = Address::generate(&env);
        let name = String::from_str(&env, "Acme KYC");

        client.add_issuer(&issuer, &name);
        assert!(client.is_issuer(&issuer));

        client.remove_issuer(&issuer);
        assert!(!client.is_issuer(&issuer));
    }

    /// address never added → is_issuer returns false
    #[test]
    fn test_unknown_address_is_not_issuer() {
        let (env, client, _admin) = setup();
        let stranger = Address::generate(&env);

        assert!(!client.is_issuer(&stranger));
    }

    /// calling add_issuer before initialize should panic
    #[test]
    #[should_panic(expected = "not initialized")]
    fn test_add_issuer_without_initialize_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(IssuerRegistryContract, ());
        let client = IssuerRegistryContractClient::new(&env, &contract_id);

        let issuer = Address::generate(&env);
        let name = String::from_str(&env, "Rogue KYC");
        // No initialize() call → should panic
        client.add_issuer(&issuer, &name);
    }

    /// A non-admin caller must not be able to add an issuer.
    /// We mock only the attacker's auth (not the admin's), so `admin.require_auth()`
    /// will fail when the admin has not signed the invocation.
    #[test]
    #[should_panic]
    fn test_non_admin_cannot_add_issuer() {
        let env = Env::default();

        let contract_id = env.register(IssuerRegistryContract, ());
        let client = IssuerRegistryContractClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let attacker = Address::generate(&env);

        // Initialize — mock admin auth just for this call
        env.mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "initialize",
                args: vec![&env, admin.into_val(&env)].into(),
                sub_invokes: &[],
            },
        }]);
        let wasm_hash = fixture_wasm_hash(&env);
        client.initialize(&admin, &wasm_hash);

        // Now try add_issuer but only mock the attacker's auth — admin auth is NOT provided
        let issuer = Address::generate(&env);
        let name = String::from_str(&env, "Evil KYC");
        env.mock_auths(&[MockAuth {
            address: &attacker,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "add_issuer",
                args: vec![&env, issuer.into_val(&env), name.into_val(&env)].into(),
                sub_invokes: &[],
            },
        }]);
        // admin.require_auth() inside add_issuer will not be satisfied → panic
        client.add_issuer(&issuer, &name);
    }

    /// re-adding an issuer with a new name keeps it active
    #[test]
    fn test_add_issuer_idempotent_name_update() {
        let (env, client, _admin) = setup();
        let issuer = Address::generate(&env);

        client.add_issuer(&issuer, &String::from_str(&env, "First Name"));
        assert!(client.is_issuer(&issuer));

        client.add_issuer(&issuer, &String::from_str(&env, "Updated Name"));
        assert!(client.is_issuer(&issuer));
    }

    #[test]
    fn test_get_wasm_hash_returns_stored_hash() {
        let (env, client, _admin) = setup();
        assert_eq!(client.get_wasm_hash(), fixture_wasm_hash(&env));
    }
}
