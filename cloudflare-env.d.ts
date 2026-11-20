declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    X2_OWNER_SUBJECT?: string;
    X2_EODHD_API_TOKEN?: string;
    X2_TRUEDATA_BEARER_TOKEN?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
  }
}
