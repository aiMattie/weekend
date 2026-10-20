/** Map service errors to GraphQL errors (`errors[].extensions.code`). */
import { GraphQLError } from "graphql";
import { ServiceError } from "@/lib/errors";
import { ApiLimitError } from "@/server/platform/rate-limit";

export type ErrorHint = "ColumnValueException" | "CreateBoardException" | "InvalidArgumentException";

export function codeFor(err: ServiceError, hint?: ErrorHint): string {
  switch (err.code) {
    case "not_found":
      if (/^Board/.test(err.message)) return "InvalidBoardIdException";
      if (/^Item/.test(err.message)) return "InvalidItemIdException";
      if (/^Column/.test(err.message)) return "InvalidColumnIdException";
      if (/^User/.test(err.message)) return "InvalidUserIdException";
      return "ResourceNotFoundException";
    case "forbidden":
    case "unauthorized": return "UserUnauthorizedException";
    case "validation": return hint ?? "InvalidArgumentException";
    case "conflict": return "InvalidArgumentException";
    default: return "InvalidArgumentException";
  }
}

export function toGraphQLError(err: unknown, hint?: ErrorHint): GraphQLError {
  if (err instanceof GraphQLError) return err;
  if (err instanceof ApiLimitError) {
    return new GraphQLError(err.message, { extensions: { code: err.code, status_code: err.status, ...(err.retryAfter ? { retry_in_seconds: err.retryAfter } : {}), http: { status: err.status, headers: err.retryAfter ? { "Retry-After": String(err.retryAfter) } : {} } } });
  }
  if (err instanceof ServiceError) {
    return new GraphQLError(err.message, { extensions: { code: codeFor(err, hint), status_code: err.status, error_data: err.details ? { issues: err.details } : undefined } });
  }
  console.error("[graphql] unexpected error", err);
  return new GraphQLError("Internal server error", { extensions: { code: "InternalServerError", status_code: 500 } });
}

/** Wrap a resolver body so thrown service errors become GraphQL errors with API error codes. */
export function guard<A extends unknown[], R>(fn: (...a: A) => R, hint?: ErrorHint): (...a: A) => R {
  return (...a: A): R => {
    try {
      const r = fn(...a);
      if (r instanceof Promise) return r.catch((e) => { throw toGraphQLError(e, hint); }) as R;
      return r;
    } catch (e) {
      throw toGraphQLError(e, hint);
    }
  };
}
