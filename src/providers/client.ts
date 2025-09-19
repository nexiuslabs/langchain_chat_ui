import { Client } from "@langchain/langgraph-sdk";

export function createClient(
  apiUrl: string,
  apiKey: string | undefined,
  defaultHeaders?: Record<string, string | null | undefined>,
) {
  return new Client({
    apiKey,
    apiUrl,
    defaultHeaders: defaultHeaders || {},
  });
}
