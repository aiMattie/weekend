/** Registers the OAuth access-token Bearer resolver (imported from src/lib/auth/bearer-resolvers.ts). */
import { setBearerResolver } from "@/lib/auth/bearer";
import { authenticate } from "@/server/services/oauth";

setBearerResolver((token) => authenticate(token));
