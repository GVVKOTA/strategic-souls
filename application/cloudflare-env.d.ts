declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    CF_VERSION_METADATA?: WorkerVersionMetadata;
    BUCKET?: R2Bucket;
    X2_OWNER_SUBJECT?: string;
    /** Canonical single-secret market-data key (optional precedence alias for configured provider). */
    MARKET_DATA_API_KEY?: string;
    BHARATSTOCK_API_KEY?: string;
    INDIA_API_KEY?: string;
    INDIA_API_HOST?: string;
    X2_EODHD_API_TOKEN?: string;
    X2_TRUEDATA_BEARER_TOKEN?: string;
    MARKET_DATA_PROVIDER?: string;
    MARKET_DATA_MODE?: string;
    ENABLE_PRIVATE_BROKER_DATA?: string;
    ENABLE_PUBLIC_EXCHANGE_QUOTES?: string;
    MARKET_DATA_DEMO_MODE?: string;
    MARKET_DATA_ALLOW_LOOPBACK?: string;
    MARKET_DATA_ADAPTER?: Fetcher;
    MARKET_DATA_ADAPTER_URL?: string;
    MARKET_ADAPTER_AUTH_TOKEN?: string;
    CF_ACCESS_CLIENT_ID?: string;
    CF_ACCESS_CLIENT_SECRET?: string;
    /** Transactional security email delivery (password reset & email verification). */
    RESEND_API_KEY?: string;
    SS_EMAIL_FROM?: string;
    SS_EMAIL_WEBHOOK_URL?: string;
    SS_EMAIL_WEBHOOK_TOKEN?: string;
    /** Optional news & conflict intelligence credentials (server-only). */
    SS_NEWS_API_KEY?: string;
  }
}
