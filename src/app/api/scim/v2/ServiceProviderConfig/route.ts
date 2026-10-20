import { scim } from "@/modules/admin/scim-http";

export const GET = scim(() => ({
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
  patch: { supported: true }, bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 }, filter: { supported: true, maxResults: 200 },
  changePassword: { supported: false }, sort: { supported: false }, etag: { supported: false },
  authenticationSchemes: [{ type: "oauthbearertoken", name: "Bearer token", description: "SCIM token from Admin > Security" }],
}));
