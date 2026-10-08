declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    SYNC_AUTH_SECRET?: string;
    SYNC_SCHEDULE_PAUSED?: string;
  }
}
