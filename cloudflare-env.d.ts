declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    X2_OWNER_SUBJECT?: string;
    X2_EODHD_API_TOKEN?: string;
    X2_TRUEDATA_BEARER_TOKEN?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    MARKET_DATA_PROVIDER?: string;
    MARKET_DATA_MODE?: string;
    ENABLE_PRIVATE_BROKER_DATA?: string;
    ENABLE_PUBLIC_EXCHANGE_QUOTES?: string;
    MARKET_DATA_DEMO_MODE?: string;
    MARKET_DATA_ALLOW_LOOPBACK?: string;
    MARKET_DATA_ADAPTER_URL?: string;
    MARKET_ADAPTER_AUTH_TOKEN?: string;
    CF_ACCESS_CLIENT_ID?: string;
    CF_ACCESS_CLIENT_SECRET?: string;
  }
}
