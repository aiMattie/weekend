/** Errors thrown by services; REST/GraphQL/MCP layers map them (see src/server/http.ts). */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "unauthorized" | "validation" | "conflict" | "bad_request",
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export class NotFoundError extends ServiceError {
  constructor(what = "Resource") {
    super(`${what} not found`, "not_found", 404);
  }
}
export class ForbiddenError extends ServiceError {
  constructor(message = "You do not have permission to do this") {
    super(message, "forbidden", 403);
  }
}
export class UnauthorizedError extends ServiceError {
  constructor(message = "Not authenticated") {
    super(message, "unauthorized", 401);
  }
}
export class ValidationError extends ServiceError {
  constructor(message: string, details?: unknown) {
    super(message, "validation", 400, details);
  }
}
export class ConflictError extends ServiceError {
  constructor(message: string) {
    super(message, "conflict", 409);
  }
}
