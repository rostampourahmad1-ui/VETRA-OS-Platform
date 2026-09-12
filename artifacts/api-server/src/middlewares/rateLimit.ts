import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "15 minutes",
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: "Too many requests, please try again later.",
      retryAfter: Math.ceil((req as any).rateLimit.resetTime.getTime() / 1000),
    });
  },
});

/**
 * Stricter rate limiter for authentication endpoints
 * 5 requests per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful auth attempts
  message: {
    error: "Too many authentication attempts, please try again later.",
    retryAfter: "15 minutes",
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: "Too many authentication attempts, please try again later.",
      retryAfter: Math.ceil((req as any).rateLimit.resetTime.getTime() / 1000),
    });
  },
});

/**
 * Rate limiter for file upload endpoints
 * 10 requests per hour per IP
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many file uploads, please try again later.",
    retryAfter: "1 hour",
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: "Too many file uploads, please try again later.",
      retryAfter: Math.ceil((req as any).rateLimit.resetTime.getTime() / 1000),
    });
  },
});

/**
 * Rate limiter for reporting endpoints (computationally expensive)
 * 20 requests per 5 minutes per IP
 */
export const reportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many report requests, please try again later.",
    retryAfter: "5 minutes",
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: "Too many report requests, please try again later.",
      retryAfter: Math.ceil((req as any).rateLimit.resetTime.getTime() / 1000),
    });
  },
});
