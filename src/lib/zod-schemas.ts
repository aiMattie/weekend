import { z } from "zod";

/** Numeric-looking id string (see src/lib/id.ts). Accepts numbers too (GraphQL clients send ints). */
export const idSchema = z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d+$/, "Invalid id"));
export const optionalId = idSchema.nullish();
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be #rrggbb");
export const nameSchema = z.string().trim().min(1, "Name is required").max(255);
export const positionSpecSchema = z.object({
  position: z.number().finite().optional(),
  beforeId: idSchema.optional(),
  afterId: idSchema.optional(),
  top: z.boolean().optional(),
});
export type PositionSpecInput = z.infer<typeof positionSpecSchema>;
