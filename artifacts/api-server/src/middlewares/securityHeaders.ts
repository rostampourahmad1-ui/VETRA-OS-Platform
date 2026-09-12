import helmet from "helmet";

/**
 * Security headers middleware using helmet
 * Configures various HTTP security headers to protect against common attacks
 */
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for some UI libraries
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },

  // HTTP Strict Transport Security (HSTS)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // X-Frame-Options: DENY
  frameguard: {
    action: "deny",
  },

  // X-Content-Type-Options: nosniff
  noSniff: true,

  // X-XSS-Protection: 0 (modern browsers use CSP instead)
  xssFilter: false,

  // Referrer-Policy: strict-origin-when-cross-origin
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin",
  },

  // X-Permitted-Cross-Domain-Policies: none
  permittedCrossDomainPolicies: {
    permittedPolicies: "none",
  },

  // X-Download-Options: noopen
  ieNoOpen: true,

  // X-DNS-Prefetch-Control: off
  dnsPrefetchControl: {
    allow: false,
  },
});
