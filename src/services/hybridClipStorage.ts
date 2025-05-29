import crypto from "node:crypto";
import Redis from "ioredis";

export interface Clip {
  id: string;
  content: string;
  contentType: "text" | "url" | "code";
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  maxAccess?: number;
  password?: string;
  burnAfterReading: boolean;
}

export interface CreateClipOptions {
  content: string;
  contentType?: "text" | "url" | "code";
  expirationMinutes?: number;
  password?: string;
  burnAfterReading?: boolean;
  maxAccess?: number;
}

export interface StorageStats {
  totalClips: number;
  activeClips: number;
  expiredClips: number;
  oldestClip: number | null;
  totalAccesses: number;
  redisConnected: boolean;
  memoryClips: number;
  redisClips: number;
}

export class HybridClipStorage {
  private memoryClips: Map<string, Clip> = new Map();
  private redis: Redis | null = null;
  private cleanupInterval: NodeJS.Timeout;
  private redisConnected = false;

  constructor() {
    this.initializeRedis();

    // Clean up expired clips every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredClips();
    }, 60 * 1000);

    console.log("🔄 Hybrid storage initialized (Memory + Redis)");
  }

  /**
   * Initialize Redis connection with fallback gracefully
   */
  private async initializeRedis(): Promise<void> {
    try {
      // Check for Redis connection string in environment
      // Use Redis URL in dev mode, Upstash in production
      const redisUrl =
        process.env.NODE_ENV === "production"
          ? process.env.UPSTASH_REDIS_URL
          : process.env.REDIS_URL;

      if (!redisUrl) {
        console.log("📝 No Redis URL found, using memory-only storage");
        console.log(
          "💡 Set REDIS_URL or UPSTASH_REDIS_URL environment variable to enable Redis"
        );
        return;
      }

      this.redis = new Redis(redisUrl, {
        retryStrategy: () => 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        reconnectOnError: (err) => {
          console.log("🔄 Redis reconnecting:", err.message);
          return true;
        },
      });

      await this.redis.connect();
      this.redisConnected = true;
      console.log("✅ Redis connected successfully");

      // Handle Redis connection events
      this.redis.on("error", (err) => {
        console.error("❌ Redis error:", err.message);
        this.redisConnected = false;
      });

      this.redis.on("connect", () => {
        console.log("🔄 Redis connected");
        this.redisConnected = true;
      });

      this.redis.on("close", () => {
        console.log("📴 Redis connection closed");
        this.redisConnected = false;
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.log(
        "⚠️ Redis connection failed, using memory-only storage:",
        errorMessage
      );
      this.redis = null;
      this.redisConnected = false;
    }
  }

  /**
   * Create a new clip with hybrid storage
   */
  async createClip(
    options: CreateClipOptions
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = this.generateToken();
    const now = new Date();
    const expirationMinutes = options.expirationMinutes || 60;
    const expiresAt = new Date(now.getTime() + expirationMinutes * 60 * 1000);

    const clip: Clip = {
      id: token,
      content: options.content,
      contentType: options.contentType || "text",
      createdAt: now,
      expiresAt,
      accessCount: 0,
      maxAccess: options.maxAccess,
      password: options.password
        ? this.hashPassword(options.password)
        : undefined,
      burnAfterReading: options.burnAfterReading || false,
    };

    // Store in memory first (always works)
    this.memoryClips.set(token, clip);

    // Try to store in Redis as backup
    await this.storeInRedis(token, clip, expirationMinutes * 60);

    console.log(
      `📎 Clip created: ${token} (expires: ${expiresAt.toISOString()}) [Memory${
        this.redisConnected ? " + Redis" : " only"
      }]`
    );

    return { token, expiresAt };
  }

  /**
   * Retrieve a clip with hybrid fallback
   */
  async getClip(token: string, password?: string): Promise<Clip | null> {
    // Try memory first (fastest)
    let clip = this.memoryClips.get(token);

    // If not in memory, try Redis
    if (!clip && this.redisConnected) {
      clip = await this.getFromRedis(token);

      // If found in Redis, restore to memory for next time
      if (clip) {
        this.memoryClips.set(token, clip);
        console.log(`🔄 Clip restored from Redis to memory: ${token}`);
      }
    }

    if (!clip) {
      return null;
    }

    // Check if expired
    if (new Date() > clip.expiresAt) {
      await this.deleteClip(token);
      console.log(`🗑️ Expired clip deleted: ${token}`);
      return null;
    }

    // Check password if required
    if (
      clip.password &&
      (!password || !this.verifyPassword(password, clip.password))
    ) {
      return null;
    }

    // Check max access limit
    if (clip.maxAccess && clip.accessCount >= clip.maxAccess) {
      await this.deleteClip(token);
      console.log(`🗑️ Max access reached, clip deleted: ${token}`);
      return null;
    }

    // Increment access count
    clip.accessCount++;

    // Update in both storages
    this.memoryClips.set(token, clip);
    await this.storeInRedis(
      token,
      clip,
      Math.floor((clip.expiresAt.getTime() - Date.now()) / 1000)
    );

    // Burn after reading
    if (clip.burnAfterReading) {
      await this.deleteClip(token);
      console.log(`🔥 Burn after reading, clip deleted: ${token}`);
    }

    console.log(`📖 Clip accessed: ${token} (count: ${clip.accessCount})`);

    return clip;
  }

  /**
   * Get clip info without incrementing access count
   */
  async getClipInfo(
    token: string
  ): Promise<Pick<
    Clip,
    "createdAt" | "expiresAt" | "accessCount" | "contentType"
  > | null> {
    // Try memory first
    let clip = this.memoryClips.get(token);

    // Fallback to Redis
    if (!clip && this.redisConnected) {
      clip = await this.getFromRedis(token);
    }

    if (!clip || new Date() > clip.expiresAt) {
      return null;
    }

    return {
      createdAt: clip.createdAt,
      expiresAt: clip.expiresAt,
      accessCount: clip.accessCount,
      contentType: clip.contentType,
    };
  }

  /**
   * Delete a clip from both storages
   */
  async deleteClip(token: string): Promise<boolean> {
    const memoryDeleted = this.memoryClips.delete(token);

    let redisDeleted = false;
    if (this.redisConnected) {
      try {
        const result = await this.redis?.del(token);
        redisDeleted = result! > 0;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error("Redis delete error:", errorMessage);
      }
    }

    const deleted = memoryDeleted || redisDeleted;
    if (deleted) {
      console.log(
        `🗑️ Clip deleted: ${token} [Memory: ${memoryDeleted}, Redis: ${redisDeleted}]`
      );
    }

    return deleted;
  }

  /**
   * Get comprehensive storage statistics
   */
  async getStats(): Promise<StorageStats> {
    const now = new Date();
    const memoryClips = Array.from(this.memoryClips.values()).filter(
      (clip) => clip.expiresAt > now
    );

    let redisClipsCount = 0;
    if (this.redisConnected) {
      try {
        const keys = await this.redis!.keys("*");
        redisClipsCount = keys.length;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error("Redis keys error:", errorMessage);
      }
    }

    return {
      totalClips: this.memoryClips.size,
      activeClips: memoryClips.length,
      expiredClips: this.memoryClips.size - memoryClips.length,
      oldestClip:
        memoryClips.length > 0
          ? Math.min(...memoryClips.map((c) => c.createdAt.getTime()))
          : null,
      totalAccesses: memoryClips.reduce(
        (sum, clip) => sum + clip.accessCount,
        0
      ),
      redisConnected: this.redisConnected,
      memoryClips: this.memoryClips.size,
      redisClips: redisClipsCount,
    };
  }

  /**
   * Store clip in Redis with TTL
   */
  private async storeInRedis(
    token: string,
    clip: Clip,
    ttlSeconds: number
  ): Promise<void> {
    if (!this.redisConnected || !this.redis) return;

    try {
      await this.redis.setex(
        token,
        ttlSeconds,
        JSON.stringify({
          ...clip,
          createdAt: clip.createdAt.toISOString(),
          expiresAt: clip.expiresAt.toISOString(),
        })
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Redis store error:", errorMessage);
    }
  }

  /**
   * Get clip from Redis
   */
  private async getFromRedis(token: string): Promise<Clip | undefined> {
    if (!this.redisConnected || !this.redis) return undefined;

    try {
      const data = await this.redis.get(token);
      if (!data) return undefined;

      const parsed = JSON.parse(data);
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        expiresAt: new Date(parsed.expiresAt),
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Redis get error:", errorMessage);
      return undefined;
    }
  }

  /**
   * Generate a secure random token
   */
  private generateToken(): string {
    return crypto.randomBytes(16).toString("hex");
  }

  /**
   * Hash password using crypto
   */
  private hashPassword(password: string): string {
    return crypto.createHash("sha256").update(password).digest("hex");
  }

  /**
   * Verify password against hash
   */
  private verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  /**
   * Clean up expired clips from memory
   */
  private cleanupExpiredClips(): void {
    const now = new Date();
    let deletedCount = 0;

    for (const [token, clip] of this.memoryClips.entries()) {
      if (now > clip.expiresAt) {
        this.memoryClips.delete(token);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`🧹 Memory cleanup: ${deletedCount} expired clips removed`);
    }
  }

  /**
   * Cleanup resources on shutdown
   */
  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.redis) {
      await this.redis.quit();
      console.log("📴 Redis connection closed");
    }
  }
}
