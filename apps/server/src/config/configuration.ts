export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  stellar: {
    network: process.env.STELLAR_NETWORK ?? 'testnet',
    horizonUrl: process.env.HORIZON_URL,
    sorobanRpcUrl: process.env.SOROBAN_RPC_URL,
    serverSecret: process.env.STELLAR_SERVER_SECRET,
    homeDomain: process.env.HOME_DOMAIN ?? 'localhost',
  },

  soroban: {
    issuerRegistryContractId: process.env.ISSUER_REGISTRY_CONTRACT_ID,
    credentialRegistryContractId: process.env.CREDENTIAL_REGISTRY_CONTRACT_ID,
    revocationRegistryContractId: process.env.REVOCATION_REGISTRY_CONTRACT_ID,
  },
});
