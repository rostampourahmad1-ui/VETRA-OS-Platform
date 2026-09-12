/**
 * VETRA-PH1: SMS stub interface.
 * No-op placeholder for future SMS integration.
 */

import { logger } from "../logger";

export interface SendSmsParams {
  to: string;
  message: string;
}

/**
 * Stub SMS sender. Logs but does not send.
 * Returns 'not_implemented'.
 */
export async function sendSms(params: SendSmsParams): Promise<"not_implemented"> {
  logger.debug({ to: params.to }, "SMS stub called (not implemented)");
  return "not_implemented";
}
