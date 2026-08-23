import { type AiProvider, type AiProviderConfig } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { OllamaProvider } from "./providers/ollama";

const providerConstructors: Record<string, new (config: AiProviderConfig) => AiProvider> = {
  openai: OpenAIProvider,
  ollama: OllamaProvider,
};

const activeProvider: { instance: AiProvider | null } = { instance: null };

/**
 * Resolve the active AI provider from environment variables.
 *
 * Priority:
 *   1. Explicit `AI_PROVIDER` env var
 *   2. `OPENAI_API_KEY` presence → "openai"
 *   3. `OLLAMA_BASE_URL` presence → "ollama"
 *   4. Fallback → "ollama" (safe default, fails gracefully if unreachable)
 */
export function resolveProviderConfig(): AiProviderConfig {
  const provider = process.env.AI_PROVIDER?.toLowerCase() ?? "";

  if (provider === "openai" || (provider !== "ollama" && process.env.OPENAI_API_KEY)) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_API_BASE,
      model: process.env.OPENAI_MODEL,
      temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : undefined,
      maxTokens: process.env.AI_MAX_TOKENS ? Number(process.env.AI_MAX_TOKENS) : undefined,
    };
  }

  return {
    provider: "ollama",
    baseUrl: process.env.OLLAMA_BASE_URL,
    model: process.env.OLLAMA_MODEL,
    temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : undefined,
    maxTokens: process.env.AI_MAX_TOKENS ? Number(process.env.AI_MAX_TOKENS) : undefined,
  };
}

/**
 * Get or create the active AI provider instance.
 * The provider is lazily initialised and cached for the process lifetime.
 */
export function getProvider(config?: AiProviderConfig): AiProvider {
  if (activeProvider.instance) return activeProvider.instance;

  const resolved = config ?? resolveProviderConfig();
  const Ctor = providerConstructors[resolved.provider];

  if (!Ctor) {
    throw new Error(`Unknown AI provider "${resolved.provider}". Supported: ${Object.keys(providerConstructors).join(", ")}`);
  }

  activeProvider.instance = new Ctor(resolved);
  return activeProvider.instance;
}

/**
 * Reset the cached provider (useful in tests or after config changes).
 */
export function resetProvider(): void {
  activeProvider.instance = null;
}
