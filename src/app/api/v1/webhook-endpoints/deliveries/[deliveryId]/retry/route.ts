import { api } from "@/server/http";
import { webhooks } from "@/server/services";

export const POST = api<{ deliveryId: string }>(({ actor, params }) => webhooks.retryDelivery(actor, params.deliveryId));
