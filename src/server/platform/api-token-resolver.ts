/** Registers the API-token Bearer resolver (imported from src/lib/auth/bearer-resolvers.ts). */
import { setBearerResolver } from "@/lib/auth/bearer";
import { authenticate } from "@/server/services/api-tokens";

setBearerResolver((token) => authenticate(token));
