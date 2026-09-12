import { body, param, query, validationResult } from "express-validator";
import type { Request, Response, NextFunction } from "express";

/**
 * Basic input sanitization rules
 * Trims whitespace and escapes HTML to prevent XSS
 */
export const sanitizeInput = [
  // Sanitize all body fields
  body("*").trim().escape(),

  // Sanitize all URL parameters
  param("*").trim().escape(),

  // Sanitize all query parameters
  query("*").trim().escape(),
];

/**
 * Middleware to check validation results and return errors
 */
export const validateRequest = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400).json({
      error: "Validation failed",
      details: errors.array().map((err) => ({
        field: err.type === "field" ? err.path : undefined,
        message: err.msg,
      })),
    });
    return;
  }

  next();
};

/**
 * Sanitize specific field types
 */
export const sanitizeEmail = body("email")
  .trim()
  .toLowerCase()
  .isEmail()
  .normalizeEmail()
  .withMessage("Invalid email address");

export const sanitizeUrl = body("url")
  .trim()
  .isURL()
  .withMessage("Invalid URL");

export const sanitizePhone = body("phone")
  .trim()
  .matches(/^[0-9+\-\s()]+$/)
  .withMessage("Invalid phone number");

export const sanitizeNumericId = param("id")
  .trim()
  .isInt({ min: 1 })
  .toInt()
  .withMessage("Invalid ID");

/**
 * Advanced sanitization for rich text fields
 * Uses a more permissive approach for fields that need formatting
 */
export const sanitizeRichText = (fieldName: string) => {
  return body(fieldName)
    .trim()
    .customSanitizer((value: string) => {
      // Allow basic HTML tags but strip dangerous ones
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "") // Remove event handlers
        .replace(/javascript:/gi, ""); // Remove javascript: protocol
    });
};
