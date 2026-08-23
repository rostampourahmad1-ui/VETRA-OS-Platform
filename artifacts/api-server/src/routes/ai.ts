import { Router } from "express";
import { requirePermission } from "../middlewares/permissions";
import { tenantId } from "../middlewares/tenant";
import { getProvider, resolveProviderConfig, RagService } from "../lib/ai";
import type { AiResponse } from "../lib/ai/types";

const router = Router();
const ragService = new RagService();

/**
 * POST /api/ai/assistant
 *
 * Swappable AI provider route with optional RAG context.
 *
 * Request body:
 *   { query: string; projectId?: number; model?: string; provider?: string }
 *
 * Provider resolved from env vars: AI_PROVIDER, OPENAI_API_KEY,
 * OPENAI_API_BASE, OPENAI_MODEL, OLLAMA_BASE_URL, OLLAMA_MODEL,
 * AI_TEMPERATURE, AI_MAX_TOKENS.
 *
 * RAG context (project data, daily reports, documents) is only included in
 * the prompt when the provider is local (ollama) or env var
 * AI_RAG_ALLOW_EXTERNAL_CONTEXT=true is set.
 */
router.post(
  "/ai/assistant",
  requirePermission("ai.use"),
  async (req, res): Promise<void> => {
    try {
      const query = String(req.body?.query ?? "").trim();
      if (!query) {
        res.status(400).json({ error: "query is required" });
        return;
      }

      const orgId = tenantId(req);
      const projectId = req.body?.projectId
        ? Number(req.body.projectId)
        : undefined;

      // 1. Resolve the AI provider
      const config = resolveProviderConfig();
      if (req.body?.provider && typeof req.body.provider === "string") {
        config.provider = req.body.provider as "openai" | "ollama";
      }
      if (req.body?.model && typeof req.body.model === "string") {
        config.model = req.body.model;
      }

      const provider = getProvider(config);

      // 2. Build RAG context (always built for provenance, but gated on output)
      const ragContext = await ragService.buildContext(
        orgId,
        projectId,
        query,
      );

      // 3. Only include detailed context for local providers or when explicitly allowed
      const isLocalProvider = config.provider === "ollama";
      const allowExternalContext =
        process.env.AI_RAG_ALLOW_EXTERNAL_CONTEXT === "true";
      const includeContext = isLocalProvider || allowExternalContext;

      const contextPrompt = includeContext
        ? ragService.formatContextPrompt(ragContext)
        : "";

      // 4. Build system prompt with tenant context
      const systemMessage = `You are VETRA OS construction management assistant. Only discuss data for organization ${orgId} and do not invent records.${contextPrompt}`;

      // 5. Call the provider
      const answer = await provider.chat(
        [
          { role: "system", content: systemMessage },
          { role: "user", content: query },
        ],
        { model: config.model },
      );

      const response: AiResponse = {
        answer,
        source: includeContext && ragContext.snippets.length > 0
          ? "rag"
          : provider.name,
        provider: provider.name,
        model: config.model ?? "default",
        ragContext:
          includeContext && ragContext.snippets.length > 0
            ? ragContext
            : undefined,
      };

      res.json(response);
    } catch (error) {
      // Graceful fallback: return mock answer when provider is unreachable
      const orgId = tenantId(req);
      const answer = `درخواست شما برای سازمان ${orgId} دریافت شد. ارائه‌دهنده AI در دسترس نیست. لطفاً بعداً تلاش کنید یا با مدیر سیستم تماس بگیرید.`;
      const response: AiResponse = {
        answer,
        source: "mock",
        provider: "none",
        model: "none",
      };
      res.json(response);
    }
  },
);

export default router;
