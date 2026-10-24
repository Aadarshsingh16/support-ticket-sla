import { getStoredToken, clearStoredSession } from "./auth.ts";
import type { GraphQLResponse, GraphQLErrorItem } from "../types/api.ts";

export class ApiError extends Error {
  public code?: string;
  public field?: string;
  public errors: GraphQLErrorItem[];

  constructor(message: string, errors: GraphQLErrorItem[] = []) {
    super(message);
    this.name = "ApiError";
    this.errors = errors;
    const firstExt = errors[0]?.extensions;
    this.code = typeof firstExt?.code === "string" ? firstExt.code : undefined;
    this.field = typeof firstExt?.field === "string" ? firstExt.field : undefined;
  }
}

export async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch("/graphql", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });
  } catch (networkError) {
    throw new ApiError(
      networkError instanceof Error
        ? `Network connection error: ${networkError.message}`
        : "Failed to connect to GraphQL server."
    );
  }

  let result: GraphQLResponse<T>;
  try {
    result = (await response.json()) as GraphQLResponse<T>;
  } catch {
    throw new ApiError(
      `Server returned invalid response (Status ${response.status}).`
    );
  }

  if (result.errors && result.errors.length > 0) {
    const firstError = result.errors[0]!;
    const code = firstError.extensions?.code;

    // Handle token expiry / invalidation
    if (code === "UNAUTHENTICATED" && token) {
      clearStoredSession();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    throw new ApiError(firstError.message, result.errors);
  }

  if (!result.data) {
    throw new ApiError("No data returned from GraphQL server.");
  }

  return result.data;
}
