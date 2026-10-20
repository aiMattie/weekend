import { api } from "@/server/http";
import { readImage } from "@/modules/admin/lib/images";
import { imageResponse } from "@/modules/admin/http";

type P = { userId: string };
export const GET = api<P>(({ params }) => imageResponse(readImage("avatar", params.userId)));
