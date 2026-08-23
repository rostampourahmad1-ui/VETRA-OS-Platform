export interface AiProvider {
  readonly name: string;

  /** Send a chat completion request and return the assistant reply. */
  chat(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<string>;
}

export interface AiProviderConfig {
  provider: "openai" | "ollama";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface RagContext {
  /** Concatenated text snippets relevant to the user query. */
  snippets: string[];
  /** Source labels for provenance. */
  sources: string[];
}

export interface AiRequest {
  query: string;
  provider?: string;
  model?: string;
  /** Optional projectId to scope RAG context. */
  projectId?: number;
}

export interface AiResponse {
  answer: string;
  source: string;
  provider: string;
  model: string;
  /** Included when RAG context was attached. */
  ragContext?: RagContext;
}
