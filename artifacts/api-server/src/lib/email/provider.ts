import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { logger } from "../logger";

/**
 * VETRA-PH1: Email service provider using nodemailer SMTP.
 * Fire-and-forget email delivery respecting user preferences.
 * Configured via env: EMAIL_ENABLED, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 */

const EMAIL_ENABLED = process.env.EMAIL_ENABLED === "true";
const SMTP_HOST = process.env.SMTP_HOST || "localhost";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "noreply@vetra.local";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!EMAIL_ENABLED) return null;
  if (transporter) return transporter;

  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    });
    logger.info({ host: SMTP_HOST, port: SMTP_PORT }, "Email transport initialized");
  } catch (error) {
    logger.error({ err: error }, "Failed to create email transport");
    return null;
  }
  return transporter;
}

export interface SendMailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends an email via SMTP. No-throw: logs errors but never propagates them.
 * Returns 'sent' | 'disabled' | 'error'.
 */
export async function sendMail(params: SendMailParams): Promise<"sent" | "disabled" | "error"> {
  const transport = getTransporter();
  if (!transport) {
    logger.debug("Email disabled or transport unavailable");
    return "disabled";
  }

  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    logger.info({ to: params.to, subject: params.subject }, "Email sent");
    return "sent";
  } catch (error) {
    logger.error({ err: error, to: params.to }, "Email send failed");
    return "error";
  }
}
