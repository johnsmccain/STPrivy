# Testnet Setup Guide

This guide explains how to configure STPrivy for Stellar Testnet and ensure wallet connection works properly.

## Server Configuration

Create `apps/server/.env` with the following testnet configuration:

```bash
# Database
DATABASE_URL=postgresql://zkkyc:zkkyc_secret@localhost:5432/zkkyc_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=change_me_in_production_must_be_32_chars_min
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# App
NODE_ENV=development
PORT=3002

# Stellar / Horizon - TESTNET
STELLAR_NETWORK=testnet
HORIZON_URL=https://horizon-testnet.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# IMPORTANT: Generate a testnet server keypair
# Use: stellar keypair generate
STELLAR_SERVER_SECRET=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# SEP-10 Configuration
# For local development: localhost
# For production: your actual domain
HOME_DOMAIN=localhost

# Soroban Contract IDs (deployed to testnet)
# These will be generated after running contracts/deploy.sh
ISSUER_REGISTRY_CONTRACT_ID=
REVOCATION_REGISTRY_CONTRACT_ID=

# Proof Verifier Contracts (one per circuit)
PROOF_VERIFIER_CONTRACT_ID_AGE_PROOF=
PROOF_VERIFIER_CONTRACT_ID_RESIDENCY_PROOF=
PROOF_VERIFIER_CONTRACT_ID_ACCREDITED_INVESTOR=
PROOF_VERIFIER_CONTRACT_ID_SANCTIONS_CHECK=
```

## Frontend Configuration

Create `apps/web/.env.local` with the following:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

## Generate Server Keypair

The server needs a Stellar keypair for SEP-10 authentication:

```bash
# Install Stellar CLI if not already installed
cargo install stellar-cli

# Generate a new keypair
stellar keypair generate

# Fund the account on testnet
stellar friendbot fund <PUBLIC_KEY>
```

Copy the secret key to `STELLAR_SERVER_SECRET` in your server `.env`.

## Deploy Smart Contracts

Deploy the Soroban contracts to testnet:

```bash
cd contracts
NETWORK=testnet STELLAR_SECRET=<YOUR_SECRET> ADMIN_ADDRESS=<YOUR_PUBLIC_KEY> ./deploy.sh
```

The script will output contract IDs. Add these to your server `.env`.

## Wallet Connection

The system supports three wallets via SEP-10 authentication:

1. **Freighter** - Install from [freighter.app](https://freighter.app)
2. **LOBSTR** - Install from [lobstr.co](https://lobstr.co)
3. **xBull** - Install from Chrome Web Store

### Testing Wallet Connection

1. Start the server:
```bash
cd apps/server
npm run start:dev
```

2. Start the frontend:
```bash
cd apps/web
npm run dev
```

3. Navigate to `http://localhost:3001`
4. Click "Connect Wallet"
5. Select a wallet (Freighter recommended)
6. Approve the connection in the wallet
7. Sign the SEP-10 challenge
8. You should be redirected to the dashboard

### Troubleshooting Wallet Connection

**Freighter not detected:**
- Ensure Freighter extension is installed and enabled
- Check that you're on the correct network (testnet)
- Try refreshing the page

**Signature fails:**
- Ensure the wallet is set to testnet network
- Check that the server's `HOME_DOMAIN` matches your frontend URL
- Verify the server keypair is funded on testnet

**SEP-10 challenge invalid:**
- Check server logs for specific error messages
- Verify `STELLAR_NETWORK=testnet` in server `.env`
- Ensure `HOME_DOMAIN` is set correctly

## HOME_DOMAIN Configuration

The `HOME_DOMAIN` environment variable is critical for SEP-10 authentication:

- **Local development**: Set to `localhost`
- **Production**: Set to your actual domain (e.g., `app.stprivy.io`)

This value must match the domain from which the frontend is served, otherwise SEP-10 signature verification will fail.

## Network Passphrase

The system automatically selects the correct network passphrase based on `STELLAR_NETWORK`:

- `testnet` → `Test SDF Network ; September 2015`
- `mainnet` → `Public Global Stellar Network ; September 2015`
- `futurenet` → `Future Network ; October 2022`

## Testnet Faucet

If you need testnet XLM for your server keypair or user wallets:

- Friendbot: `https://friendbot.stellar.org?addr=<PUBLIC_KEY>`
- Or use the Stellar CLI: `stellar friendbot fund <PUBLIC_KEY>`

## Verification

To verify everything is working:

1. Check server logs show "Test SDF Network" as network passphrase
2. Horizon API calls should go to `horizon-testnet.stellar.org`
3. Soroban RPC calls should go to `soroban-testnet.stellar.org`
4. Wallet connection should succeed with SEP-10 challenge
5. User should be able to log in and access the dashboard
