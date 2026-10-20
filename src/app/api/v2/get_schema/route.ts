import { GET as getSchema } from "../../graphql/get_schema/route";

/** Alias of /api/graphql/get_schema. */
export async function GET(req: Request): Promise<Response> {
  return getSchema(req);
}
