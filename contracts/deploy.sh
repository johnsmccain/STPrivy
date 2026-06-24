#!/usr/bin/env bash
# Deploy and initialize all STPrivy contracts.
# Passes the uploaded Wasm hash into initialize so the deployed binary origin is verifiable on-chain.
#
# Usage:
#   STELLAR_SECRET=S... ADMIN_ADDRESS=G... [NETWORK=testnet] ./deploy.sh
#
# Requirements: stellar CLI, cargo, rust wasm32v1-none target

set -euo pipefail

NETWORK="${NETWORK:-testnet}"
SOURCE_ACCOUNT="${STELLAR_SECRET:?STELLAR_SECRET is required}"
ADMIN="${ADMIN_ADDRESS:?ADMIN_ADDRESS is required}"

RPC_URL="https://soroban-testnet.stellar.org"
[ "$NETWORK" = "mainnet" ] && RPC_URL="https://soroban.stellar.org"

CONTRACTS_DIR="$(cd "$(dirname "$0")" && pwd)"
WASM_OUT="$CONTRACTS_DIR/target/wasm32v1-none/release"

# ── 1. Build ──────────────────────────────────────────────────────────────────
echo "==> Building contracts..."
cargo build --manifest-path "$CONTRACTS_DIR/Cargo.toml" \
  --target wasm32v1-none --release \
  -p issuer-registry -p revocation-registry -p proof-verifier

# ── 2. Helper: upload wasm and return hash ────────────────────────────────────
upload() {
  local wasm_file="$1"
  stellar contract upload \
    --network "$NETWORK" \
    --rpc-url "$RPC_URL" \
    --source "$SOURCE_ACCOUNT" \
    --wasm "$wasm_file" \
    2>/dev/null
}

# ── 3. Helper: deploy contract and return contract id ─────────────────────────
deploy() {
  local wasm_hash="$1"
  stellar contract deploy \
    --network "$NETWORK" \
    --rpc-url "$RPC_URL" \
    --source "$SOURCE_ACCOUNT" \
    --wasm-hash "$wasm_hash" \
    2>/dev/null
}

# ── 4. Issuer Registry ────────────────────────────────────────────────────────
echo "==> Uploading issuer-registry..."
ISSUER_WASM_HASH=$(upload "$WASM_OUT/issuer_registry.wasm")
echo "    wasm_hash: $ISSUER_WASM_HASH"

echo "==> Deploying issuer-registry..."
ISSUER_CONTRACT_ID=$(deploy "$ISSUER_WASM_HASH")
echo "    contract_id: $ISSUER_CONTRACT_ID"

echo "==> Initializing issuer-registry..."
stellar contract invoke \
  --network "$NETWORK" --rpc-url "$RPC_URL" --source "$SOURCE_ACCOUNT" \
  --id "$ISSUER_CONTRACT_ID" \
  -- initialize \
  --admin "$ADMIN" \
  --wasm_hash "$ISSUER_WASM_HASH"

# ── 5. Revocation Registry ────────────────────────────────────────────────────
echo "==> Uploading revocation-registry..."
REVOCATION_WASM_HASH=$(upload "$WASM_OUT/revocation_registry.wasm")
echo "    wasm_hash: $REVOCATION_WASM_HASH"

echo "==> Deploying revocation-registry..."
REVOCATION_CONTRACT_ID=$(deploy "$REVOCATION_WASM_HASH")
echo "    contract_id: $REVOCATION_CONTRACT_ID"

echo "==> Initializing revocation-registry..."
stellar contract invoke \
  --network "$NETWORK" --rpc-url "$RPC_URL" --source "$SOURCE_ACCOUNT" \
  --id "$REVOCATION_CONTRACT_ID" \
  -- initialize \
  --admin "$ADMIN" \
  --wasm_hash "$REVOCATION_WASM_HASH"

# ── 6. Proof Verifier (one per circuit) ───────────────────────────────────────
echo "==> Uploading proof-verifier..."
VERIFIER_WASM_HASH=$(upload "$WASM_OUT/proof_verifier.wasm")
echo "    wasm_hash: $VERIFIER_WASM_HASH"

deploy_verifier() {
  local circuit_name="$1"
  local vk_file="$2"

  if [ ! -f "$vk_file" ]; then
    echo "    SKIP $circuit_name: VK file not found at $vk_file"
    return
  fi

  echo "==> Deploying proof-verifier for $circuit_name..."
  local contract_id
  contract_id=$(deploy "$VERIFIER_WASM_HASH")
  echo "    contract_id: $contract_id"

  echo "==> Initializing proof-verifier for $circuit_name..."
  stellar contract invoke \
    --network "$NETWORK" --rpc-url "$RPC_URL" --source "$SOURCE_ACCOUNT" \
    --id "$contract_id" \
    -- initialize \
    --vk "$(xxd -p -c 0 "$vk_file")" \
    --wasm_hash "$VERIFIER_WASM_HASH"

  echo "    VERIFIER_${circuit_name^^}_CONTRACT_ID=$contract_id"
}

CIRCUITS_DIR="$CONTRACTS_DIR/../circuits"
deploy_verifier "age_proof"    "$CIRCUITS_DIR/age-proof/target/vk"

# ── 7. Verify wasm hashes on-chain ────────────────────────────────────────────
echo ""
echo "==> Verifying on-chain wasm hashes match uploaded binaries..."

verify() {
  local name="$1"
  local contract_id="$2"
  local expected_hash="$3"

  local stored
  stored=$(stellar contract invoke \
    --network "$NETWORK" --rpc-url "$RPC_URL" --source "$SOURCE_ACCOUNT" \
    --id "$contract_id" \
    -- get_wasm_hash 2>/dev/null)

  if [ "$stored" = "\"$expected_hash\"" ] || [ "$stored" = "$expected_hash" ]; then
    echo "    OK  $name: $stored"
  else
    echo "    FAIL $name: stored=$stored expected=$expected_hash" >&2
    exit 1
  fi
}

verify "issuer-registry"    "$ISSUER_CONTRACT_ID"    "$ISSUER_WASM_HASH"
verify "revocation-registry" "$REVOCATION_CONTRACT_ID" "$REVOCATION_WASM_HASH"

# ── 8. Print .env block ───────────────────────────────────────────────────────
echo ""
echo "==> Add to your .env:"
echo "ISSUER_REGISTRY_CONTRACT_ID=$ISSUER_CONTRACT_ID"
echo "REVOCATION_REGISTRY_CONTRACT_ID=$REVOCATION_CONTRACT_ID"
