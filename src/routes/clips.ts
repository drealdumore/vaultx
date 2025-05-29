import { Router, Request, Response, NextFunction } from "express";
import { body, param, validationResult } from "express-validator";
import type { HybridClipStorage } from "../services/hybridClipStorage";

export function clipRoutes(storage: HybridClipStorage): Router {
  const router = Router();

  /**
   * POST /api/clip - Create a new clip
   */
  router.post(
    "/clip",
    [
      body("content")
        .notEmpty()
        .withMessage("Content is required")
        .isLength({ max: 100000 })
        .withMessage("Content must be less than 100KB"),
      body("contentType")
        .optional()
        .isIn(["text", "url", "code"])
        .withMessage("Content type must be text, url, or code"),
      body("expirationMinutes")
        .optional()
        .isInt({ min: 1, max: 10080 }) // Max 7 days
        .withMessage("Expiration must be between 1 minute and 7 days"),
      body("password")
        .optional()
        .isLength({ min: 4, max: 100 })
        .withMessage("Password must be between 4-100 characters"),
      body("burnAfterReading")
        .optional()
        .isBoolean()
        .withMessage("burnAfterReading must be a boolean"),
      body("maxAccess")
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage("maxAccess must be between 1-1000"),
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: "Validation failed",
            details: errors.array(),
          });
        }

        const {
          content,
          contentType,
          expirationMinutes,
          password,
          burnAfterReading,
          maxAccess,
        } = req.body;

        // Create the clip
        const result = await storage.createClip({
          content,
          contentType,
          expirationMinutes,
          password,
          burnAfterReading,
          maxAccess,
        });

        // Return success response
        res.status(201).json({
          success: true,
          token: result.token,
          url: `${req.protocol}://${req.get("host")}/api/clip/${result.token}`,
          expiresAt: result.expiresAt.toISOString(),
          expiresIn: `${expirationMinutes || 60} minutes`,
          message: "Clip created successfully",
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/clip/:token - Retrieve a clip
   */
  router.get(
    "/clip/:token",
    [
      param("token")
        .isHexadecimal()
        .isLength({ min: 32, max: 32 })
        .withMessage("Invalid token format"),
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: "Invalid token format",
            details: errors.array(),
          });
        }

        const { token } = req.params;
        const password = req.query.password as string;

        // Try to get the clip
        const clip = await storage.getClip(token, password);

        if (!clip) {
          return res.status(404).json({
            error: "Clip not found",
            message:
              "The clip may have expired, been deleted, or the token is invalid.",
          });
        }

        // Return the clip data
        res.status(200).json({
          success: true,
          data: {
            content: clip.content,
            contentType: clip.contentType,
            createdAt: clip.createdAt.toISOString(),
            accessCount: clip.accessCount,
            burnAfterReading: clip.burnAfterReading,
          },
          metadata: {
            expiresAt: clip.expiresAt.toISOString(),
            timeRemaining: Math.max(0, clip.expiresAt.getTime() - Date.now()),
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/clip/:token/info - Get clip metadata without accessing content
   */
  router.get(
    "/clip/:token/info",
    [
      param("token")
        .isHexadecimal()
        .isLength({ min: 32, max: 32 })
        .withMessage("Invalid token format"),
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: "Invalid token format",
            details: errors.array(),
          });
        }

        const { token } = req.params;
        const info = await storage.getClipInfo(token);

        if (!info) {
          return res.status(404).json({
            error: "Clip not found",
            message: "The clip may have expired or the token is invalid.",
          });
        }

        res.status(200).json({
          success: true,
          data: {
            ...info,
            createdAt: info.createdAt.toISOString(),
            expiresAt: info.expiresAt.toISOString(),
            timeRemaining: Math.max(0, info.expiresAt.getTime() - Date.now()),
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * DELETE /api/clip/:token - Delete a clip manually
   */
  router.delete(
    "/clip/:token",
    [
      param("token")
        .isHexadecimal()
        .isLength({ min: 32, max: 32 })
        .withMessage("Invalid token format"),
    ],
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            error: "Invalid token format",
            details: errors.array(),
          });
        }

        const { token } = req.params;
        const deleted = await storage.deleteClip(token);

        if (!deleted) {
          return res.status(404).json({
            error: "Clip not found",
            message:
              "The clip may have already been deleted or the token is invalid.",
          });
        }

        res.status(200).json({
          success: true,
          message: "Clip deleted successfully",
        });
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/stats - Get storage statistics
   */
  router.get(
    "/stats",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const stats = await storage.getStats();

        res.status(200).json({
          success: true,
          data: {
            ...stats,
            oldestClip: stats.oldestClip
              ? new Date(stats.oldestClip).toISOString()
              : null,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
