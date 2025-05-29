import crypto from "crypto";

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

export class ClipStorage {
  private clips: Map<string, Clip> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired clips every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredClips();
    }, 60 * 1000);
  }

  /**
   * Create a new clip with auto-generated token
   */
  createClip(options: CreateClipOptions): { token: string; expiresAt: Date } {
    const token = this.generateToken();
    const now = new Date();
    const expirationMinutes = options.expirationMinutes || 60; // Default 1 hour
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

    this.clips.set(token, clip);

    console.log(
      `📎 Clip created: ${token} (expires: ${expiresAt.toISOString()})`
    );

    return { token, expiresAt };
  }

  /**
   * Retrieve a clip by token
   */
  getClip(token: string, password?: string): Clip | null {
    const clip = this.clips.get(token);

    if (!clip) {
      return null;
    }

    // Check if expired
    if (new Date() > clip.expiresAt) {
      this.clips.delete(token);
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
      this.clips.delete(token);
      console.log(`🗑️ Max access reached, clip deleted: ${token}`);
      return null;
    }

    // Increment access count
    clip.accessCount++;

    // Burn after reading
    if (clip.burnAfterReading) {
      this.clips.delete(token);
      console.log(`🔥 Burn after reading, clip deleted: ${token}`);
    }

    console.log(`📖 Clip accessed: ${token} (count: ${clip.accessCount})`);

    return clip;
  }

  /**
   * Get clip metadata without incrementing access count
   */
  getClipInfo(
    token: string
  ): Pick<
    Clip,
    "createdAt" | "expiresAt" | "accessCount" | "contentType"
  > | null {
    const clip = this.clips.get(token);

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
   * Delete a specific clip
   */
  deleteClip(token: string): boolean {
    const deleted = this.clips.delete(token);
    if (deleted) {
      console.log(`🗑️ Clip manually deleted: ${token}`);
    }
    return deleted;
  }

  /**
   * Get storage statistics
   */
  getStats() {
    const now = new Date();
    const activeClips = Array.from(this.clips.values()).filter(
      (clip) => clip.expiresAt > now
    );

    return {
      totalClips: this.clips.size,
      activeClips: activeClips.length,
      expiredClips: this.clips.size - activeClips.length,
      oldestClip:
        activeClips.length > 0
          ? Math.min(...activeClips.map((c) => c.createdAt.getTime()))
          : null,
      totalAccesses: activeClips.reduce(
        (sum, clip) => sum + clip.accessCount,
        0
      ),
    };
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
   * Clean up expired clips
   */
  private cleanupExpiredClips(): void {
    const now = new Date();
    let deletedCount = 0;

    for (const [token, clip] of this.clips.entries()) {
      if (now > clip.expiresAt) {
        this.clips.delete(token);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`🧹 Cleanup: ${deletedCount} expired clips removed`);
    }
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
