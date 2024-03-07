import { Query } from "express-serve-static-core";
import sanitize from "sanitize-html";
import { z } from "zod";
<<<<<<< HEAD
import { User } from "./users/schema";
=======
>>>>>>> upstream/main

export function parseSort(sort: Query["sort"]) {
  if (!sort) return null;
  if (typeof sort === "string") return sort.split(",");
  if (Array.isArray(sort)) return sort.splice(3) as string[];
  return null;
}

export function sortBy(fields: string[], asc = true) {
  return (a: any, b: any) => {
    for (const field of fields) {
      if (a[field] !== b[field]) {
        // always sort nulls to the end
        if (a[field] == null) return 1;
        if (b[field] == null) return -1;

        const valA = Array.isArray(a[field]) ? a[field].length : a[field];
        const valB = Array.isArray(b[field]) ? b[field].length : b[field];

        const result = valA < valB ? -1 : 1;
        return asc ? result : -result;
      }
    }
    return 0;
  };
}

export function paginate(set: unknown[], page: number, pageSize: number = 20) {
  const p = Math.max(1, Math.min(page, Math.ceil(set.length / pageSize)));
  return {
    page: p,
    items: set.slice((p - 1) * pageSize, p * pageSize),
    pageSize,
    pageCount: Math.ceil(set.length / pageSize),
    totalCount: set.length,
    nextPage: p * pageSize < set.length ? p + 1 : null,
    prevPage: p > 1 ? p - 1 : null,
  };
}

export function sanitizeAndTrim(
  input?: string | null,
  options: sanitize.IOptions = {
    allowedTags: [],
    allowedAttributes: {},
  }
) {
  return sanitize((input ?? "").trim(), options);
}

// https://github.com/colinhacks/zod/discussions/2050#discussioncomment-5018870
export function makeOptionalPropsNullable<Schema extends z.AnyZodObject>(
  schema: Schema
) {
  const entries = Object.entries(schema.shape) as [
    keyof Schema["shape"],
<<<<<<< HEAD
    z.ZodTypeAny,
=======
    z.ZodTypeAny
>>>>>>> upstream/main
  ][];
  const newProps = entries.reduce(
    (acc, [key, value]) => {
      acc[key] =
        value instanceof z.ZodOptional ? value.unwrap().nullable() : value;
      return acc;
    },
    {} as {
      [key in keyof Schema["shape"]]: Schema["shape"][key] extends z.ZodOptional<
        infer T
      >
        ? z.ZodNullable<T>
        : Schema["shape"][key];
    }
  );
  return z.object(newProps);
}

export function redactIp(ip: string) {
  const ipv6 = ip.includes(":");
  return ipv6 ? "redacted:ipv6" : ip.replace(/\.\d+\.\d+$/, ".xxx.xxx");
}

<<<<<<< HEAD
export function sortIpUsage(ipUsage: User["ipUsage"]) {
  if (!ipUsage) return [];

  return ipUsage.sort(sortBy(["lastUsedAt", "ip"], false)).map((usage) => ({
    ...usage,
    lastUsedAt: usage.lastUsedAt
      ? new Date(usage.lastUsedAt || 0).toLocaleString("en-US", {
          hour12: false,
          timeZone: "UTC",
        })
      : "never",
  }));
}

=======
>>>>>>> upstream/main
export function assertNever(x: never): never {
  throw new Error(`Called assertNever with argument ${x}.`);
}
