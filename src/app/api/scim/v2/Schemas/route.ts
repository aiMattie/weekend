import { scim } from "@/modules/admin/scim-http";

export const GET = scim(() => ({
  schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: 1, startIndex: 1, itemsPerPage: 1,
  Resources: [{ id: "urn:ietf:params:scim:schemas:core:2.0:User", name: "User", description: "User account" }],
}));
