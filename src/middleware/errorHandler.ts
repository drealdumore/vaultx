import type { NextFunction, Request, Response } from "express";

export interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Global error handling middleware
 */
export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error details
  console.error("🚨 Error occurred:", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  // Default error response
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let details: any = undefined;

  // Handle specific error types
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed";
    details = err.message;
  }

  if (err.name === "SyntaxError" && "body" in err) {
    statusCode = 400;
    message = "Invalid JSON format";
  }

  if (err.name === "PayloadTooLargeError") {
    statusCode = 413;
    message = "Request payload too large";
  }

  // Don't expose internal errors in production
  if (statusCode === 500 && process.env.NODE_ENV === "production") {
    message = "Something went wrong on our end";
    details = undefined;
  }

  // Send error response
  res.status(statusCode).json({
    error: message,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
    path: req.path,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}

/**
 * Create operational error
 */
export function createError(message: string, statusCode = 500): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler<T extends Request, U extends Response>(
  fn: (req: T, res: U, next: NextFunction) => Promise<any>
) {
  return (req: T, res: U, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
