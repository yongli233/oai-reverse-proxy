import { ZodType, z } from "zod";
import type { ModelFamily } from "../models";
import { makeOptionalPropsNullable } from "../utils";

export const tokenCountsSchema: ZodType<UserTokenCounts> = z.object({
  turbo: z.number().optional().default(0),
  gpt4: z.number().optional().default(0),
  "gpt4-32k": z.number().optional().default(0),
  "gpt4-turbo": z.number().optional().default(0),
  "dall-e": z.number().optional().default(0),
  claude: z.number().optional().default(0),
  "gemini-pro": z.number().optional().default(0),
  "aws-claude": z.number().optional().default(0),
});

export const UserSchema = z
  .object({
    /** User's personal access token. */
    token: z.string(),
    /** IP addresses the user has connected from. */
    ip: z.array(z.string()),
    ipUsage: z.array(
      z.object({
        ip: z.string(),
        prompt: z.number(),
        lastUsedAt: z.number().optional(),
      })
    ),
    /** User's nickname. */
    nickname: z.string().max(80).optional(),
    /**
     * The user's privilege level.
     * - `normal`: Default role. Subject to usual rate limits and quotas.
     * - `special`: Special role. Higher quotas and exempt from
     *   auto-ban/lockout.
     **/
    type: z.enum(["normal", "special", "temporary"]),
    /** Number of prompts the user has made. */
    promptCount: z.number(),
    /**
     * @deprecated Use `tokenCounts` instead.
     * Never used; retained for backwards compatibility.
     */
    tokenCount: z.any().optional(),
    /** Number of tokens the user has consumed, by model family. */
    tokenCounts: tokenCountsSchema,
    /** Maximum number of tokens the user can consume, by model family. */
    tokenLimits: tokenCountsSchema,
    /** Time at which the user was created. */
    createdAt: z.number(),
    /** Time at which the user last connected. */
    lastUsedAt: z.number().optional(),
    /** Time at which the user was disabled, if applicable. */
    disabledAt: z.number().optional(),
    /** Reason for which the user was disabled, if applicable. */
    disabledReason: z.string().optional(),
    /** Time at which the user will expire and be disabled (for temp users). */
    expiresAt: z.number().optional(),
    /** The user's maximum number of IP addresses; supercedes global max. */
    maxIps: z.coerce.number().int().min(0).optional(),
    /** Private note about the user. */
    adminNote: z.string().optional(),

    /** Number of tokens the user has consumed since start, by model family. */
    tokenCountsSinceStart: tokenCountsSchema,
    /** Number of prompts the user has made since start. */
    promptCountSinceStart: z.number(),
  })
  .strict();

/**
 * Variant of `UserSchema` which allows for partial updates, and makes any
 * optional properties on the base schema nullable. Null values are used to
 * indicate that the property should be deleted from the user object.
 */
export const UserPartialSchema = makeOptionalPropsNullable(UserSchema)
  .partial()
  .extend({ token: z.string() });

export type UserTokenCounts = {
  [K in ModelFamily]?: number;
};
export type User = z.infer<typeof UserSchema>;
export type UserUpdate = z.infer<typeof UserPartialSchema>;
