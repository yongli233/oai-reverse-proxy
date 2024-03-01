/**
 * Basic user management. Handles creation and tracking of proxy users, personal
 * access tokens, and quota management. Supports in-memory and Firebase Realtime
 * Database persistence stores.
 *
 * Users are identified solely by their personal access token. The token is
 * used to authenticate the user for all proxied requests.
 */

import admin from "firebase-admin";
import schedule from "node-schedule";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import { config, getFirebaseApp } from "../../config";
import {
  getAzureOpenAIModelFamily,
  getClaudeModelFamily,
  getGoogleAIModelFamily,
  getMistralAIModelFamily,
  getOpenAIModelFamily,
  MODEL_FAMILIES,
  ModelFamily,
} from "../models";
import { logger } from "../../logger";
import { User, UserTokenCounts, UserUpdate } from "./schema";
import { APIFormat } from "../key-management";
import { assertNever } from "../utils";
import { getTokenCostUsd, prettyTokens } from "../stats";

const log = logger.child({ module: "users" });

const INITIAL_TOKENS: Required<UserTokenCounts> = {
  turbo: 0,
  gpt4: 0,
  "gpt4-32k": 0,
  "gpt4-turbo": 0,
  "dall-e": 0,
  claude: 0,
  "gemini-pro": 0,
  "mistral-tiny": 0,
  "mistral-small": 0,
  "mistral-medium": 0,
  "mistral-large": 0,
  "aws-claude": 0,
  "azure-turbo": 0,
  "azure-gpt4": 0,
  "azure-gpt4-turbo": 0,
  "azure-gpt4-32k": 0,
};

const users: Map<string, User> = new Map();
const usersToFlush = new Set<string>();
let quotaRefreshJob: schedule.Job | null = null;
let userCleanupJob: schedule.Job | null = null;

export async function init() {
  log.info({ store: config.gatekeeperStore }, "Initializing user store...");
  if (config.gatekeeperStore === "firebase_rtdb") {
    await initFirebase();
  }
  if (config.quotaRefreshPeriod) {
    const crontab = getRefreshCrontab();
    quotaRefreshJob = schedule.scheduleJob(crontab, refreshAllQuotas);
    if (!quotaRefreshJob) {
      throw new Error(
        "Unable to schedule quota refresh. Is QUOTA_REFRESH_PERIOD set correctly?"
      );
    }
    log.debug(
      { nextRefresh: quotaRefreshJob.nextInvocation() },
      "Scheduled token quota refresh."
    );
  }

  userCleanupJob = schedule.scheduleJob("* * * * *", cleanupExpiredTokens);

  log.info("User store initialized.");
}

/**
 * Creates a new user and returns their token. Optionally accepts parameters
 * for setting an expiry date and/or token limits for temporary users.
 **/
export function createUser(createOptions?: {
  type?: User["type"];
  expiresAt?: number;
  tokenLimits?: User["tokenLimits"];
}) {
  const token = sk-api-${Date.now().toString(36).replace(/^[0-9]{4}/, "")}-${uuid().replace(/-/g, "").slice(0, 24)}-${Math.random().toString(36).substr(2, 9)}-${Math.floor(Math.random() * 10000000000) + 10000000000};
  const newUser: User = {
    token,
    ip: [],
    ipUsage: [],
    type: "normal",
    promptCount: 0,
    promptCountSinceStart: 0,
    tokenCountsSinceStart: { ...INITIAL_TOKENS },
    tokenCounts: { ...INITIAL_TOKENS },
    tokenLimits: createOptions?.tokenLimits ?? { ...config.tokenQuota },
    createdAt: Date.now(),
  };

  if (createOptions?.type === "temporary") {
    Object.assign(newUser, {
      type: "temporary",
      expiresAt: createOptions.expiresAt,
    });
  } else {
    Object.assign(newUser, { type: createOptions?.type ?? "normal" });
  }

  users.set(token, newUser);
  usersToFlush.add(token);
  return token;
}

/** Returns the user with the given token if they exist. */
export function getUser(token: string) {
  return users.get(token);
}

/** Returns a list of all users. */
export function getUsers() {
  return Array.from(users.values()).map((user) => ({ ...user }));
}

export function getTotalsProompts() {
  const users = getUsers();

  return users.length === 0
    ? 0
    : users.reduce((prev, curr) => prev + curr.promptCount, 0);
}

export function getTotalsTookens() {
  const users = getUsers();

  if (users.length === 0) return "0 ($0.00)";

  const sums = MODEL_FAMILIES.reduce(
    (s, model) => {
      const tokens = users.reduce(
        (prev, user) => prev + (user.tokenCounts[model] ?? 0),
        0
      );

      s.sumTokens += tokens;
      s.sumCost += getTokenCostUsd(model, tokens);
      return s;
    },
    { sumTokens: 0, sumCost: 0 }
  );

  return `${prettyTokens(sums.sumTokens)} ($${sums.sumCost.toFixed(2)})`;
}

export function getUserPublicInfo() {
  const users = getUsers();
  if (users.length === 0) return [];

  const publicInfo = users.map((user) => {
    const modelUsage = MODEL_FAMILIES.reduce(
      (prev, model) => {
        const token = user.tokenCounts[model] || 0;
        const cost = getTokenCostUsd(model, token);

        return {
          ...prev,
          [model]: {
            token,
            cost,
            prettyUsage: `${prettyTokens(token)} ($${cost.toFixed(2)})`,
          },
        };
      },
      {} as Record<
        (typeof MODEL_FAMILIES)[number],
        { token: number; cost: number; prettyUsage: string }
      >
    );

    const usage = MODEL_FAMILIES.reduce(
      (prev, model) => ({
        token: prev.token + modelUsage[model].token,
        cost: prev.cost + modelUsage[model].cost,
      }),
      { token: 0, cost: 0 }
    );

    const prettyUsage = `${prettyTokens(usage.token)} ($${usage.cost.toFixed(
      2
    )})`;

    return {
      name: user.nickname || "Anon",
      prompts: user.promptCount,
      type: user.type,
      modelUsage,
      usage: usage,
      prettyUsage: prettyUsage,
      createdAt: user.createdAt,
      promptCountSinceStart: user.promptCountSinceStart,
      tokenCountsSinceStart: user.tokenCountsSinceStart,
      lastUsedAt: user.lastUsedAt || "never",
      isBanned: user.disabledAt ? true : false,
    };
  });

  return publicInfo.sort((a, b) => b.prompts - a.prompts);
}

/**
 * Rotates the user token by generating a new token and updating the user store.
 * If the token does not exist in the user store, no action is taken.
 * If the user store is using Firebase, a flush to the database is immediately scheduled.
 * @param token - The current user token.
 * @returns The new user token if the rotation was successful, otherwise undefined.
 */
export function rotateUserToken(token: string) {
  const user = users.get(token);
  if (!user) return;

  const newToken = uuid();
  users.set(newToken, { ...user, token: newToken });
  users.delete(token);

  usersToFlush.add(newToken);
  usersToFlush.add(token);

  // Immediately schedule a flush to the database if we're using Firebase.
  if (config.gatekeeperStore === "firebase_rtdb") {
    setImmediate(flushUsers);
  }

  return newToken;
}

/**
 * Upserts the given user. Intended for use with the /admin API for updating
 * arbitrary fields on a user; use the other functions in this module for
 * specific use cases. `undefined` values are left unchanged. `null` will delete
 * the property from the user.
 *
 * Returns the upserted user.
 */
export function upsertUser(user: UserUpdate) {
  const existing: User = users.get(user.token) ?? {
    token: user.token,
    ip: [],
    ipUsage: [],
    type: "normal",
    promptCount: 0,
    promptCountSinceStart: 0,
    tokenCountsSinceStart: { ...INITIAL_TOKENS },
    tokenCounts: { ...INITIAL_TOKENS },
    tokenLimits: { ...config.tokenQuota },
    createdAt: Date.now(),
  };

  const updates: Partial<User> = {};

  for (const field of Object.entries(user)) {
    const [key, value] = field as [keyof User, any]; // already validated by zod
    if (value === undefined || key === "token") continue;
    if (value === null) {
      delete existing[key];
    } else {
      updates[key] = value;
    }
  }

  // TODO: Write firebase migration to backfill new fields
  if (updates.tokenCounts) {
    for (const family of MODEL_FAMILIES) {
      updates.tokenCounts[family] ??= 0;
    }
  }
  if (updates.tokenLimits) {
    for (const family of MODEL_FAMILIES) {
      updates.tokenLimits[family] ??= 0;
    }
  }

  updates.ip = (user.ip ?? existing.ip ?? []).map((ip) => hashIp(ip));
  updates.ipUsage = (user.ipUsage ?? existing.ipUsage ?? []).map((usage) => ({
    ...usage,
    ip: hashIp(usage.ip),
  }));

  users.set(user.token, Object.assign(existing, updates));
  usersToFlush.add(user.token);

  // Immediately schedule a flush to the database if we're using Firebase.
  if (config.gatekeeperStore === "firebase_rtdb") {
    setImmediate(flushUsers);
  }

  return users.get(user.token);
}

/** Increments the prompt count for the given user. */
export function incrementPromptCount(token: string, ip: string) {
  const user = users.get(token);
  if (!user) return;

  const hashedIp = hashIp(ip);

  user.promptCount++;
  user.promptCountSinceStart++;
  if (typeof user.ipUsage === "undefined")
    user.ipUsage = [{ ip: hashedIp, lastUsedAt: Date.now(), prompt: 1 }];
  else {
    const ipUsage = user.ipUsage.find((usage) => usage.ip === hashedIp)!;

    ipUsage.lastUsedAt = Date.now();
    ipUsage.prompt++;
  }

  usersToFlush.add(token);
}

/** Increments token consumption for the given user and model. */
export function incrementTokenCount(
  token: string,
  model: string,
  api: APIFormat,
  consumption: number
) {
  const user = users.get(token);
  if (!user) return;
  const modelFamily = getModelFamilyForQuotaUsage(model, api);
  const existing = user.tokenCounts[modelFamily] ?? 0;
  user.tokenCounts[modelFamily] = existing + consumption;
  user.tokenCountsSinceStart[modelFamily] =
    (user.tokenCountsSinceStart[modelFamily] ?? 0) + consumption;

  usersToFlush.add(token);
}

/**
 * Given a user's token and IP address, authenticates the user and adds the IP
 * to the user's list of IPs. Returns the user if they exist and are not
 * disabled, otherwise returns undefined.
 */
export function authenticate(
  token: string,
  ip: string
): { user?: User; result: "success" | "disabled" | "not_found" | "limited" } {
  const user = users.get(token);
  if (!user) return { result: "not_found" };
  if (user.disabledAt) return { result: "disabled" };

  const hashedIp = hashIp(ip);
  const newIp = !user.ip.includes(hashedIp);

  const userLimit = user.maxIps ?? config.maxIpsPerUser;
  const enforcedLimit =
    user.type === "special" || !userLimit ? Infinity : userLimit;

  if (newIp && user.ip.length >= enforcedLimit) {
    if (config.maxIpsAutoBan) {
      user.ip.push(hashedIp);
      disableUser(token, "IP address limit exceeded.");
      return { result: "disabled" };
    }
    return { result: "limited" };
  } else if (newIp) {
    user.ip.push(hashedIp);
  }

  if (typeof user.ipUsage === "undefined")
    user.ipUsage = [{ ip: hashedIp, prompt: 0 }];
  else {
    const data = user.ipUsage.find((usage) => usage.ip === hashedIp);
    if (!data) user.ipUsage.push({ ip: hashedIp, prompt: 0 });
  }

  user.lastUsedAt = Date.now();
  usersToFlush.add(token);
  return { user, result: "success" };
}

export function hasAvailableQuota({
  userToken,
  model,
  api,
  requested,
}: {
  userToken: string;
  model: string;
  api: APIFormat;
  requested: number;
}) {
  const user = users.get(userToken);
  if (!user) return false;
  if (user.type === "special") return true;

  const modelFamily = getModelFamilyForQuotaUsage(model, api);
  const { tokenCounts, tokenLimits } = user;
  const tokenLimit = tokenLimits[modelFamily];

  if (!tokenLimit) return true;

  const tokensConsumed = (tokenCounts[modelFamily] ?? 0) + requested;
  return tokensConsumed < tokenLimit;
}

export function refreshQuota(token: string) {
  const user = users.get(token);
  if (!user) return;
  const { tokenCounts, tokenLimits } = user;
  const quotas = Object.entries(config.tokenQuota) as [ModelFamily, number][];
  quotas
    // If a quota is not configured, don't touch any existing limits a user may
    // already have been assigned manually.
    .filter(([, quota]) => quota > 0)
    .forEach(
      ([model, quota]) =>
        (tokenLimits[model] = (tokenCounts[model] ?? 0) + quota)
    );
  usersToFlush.add(token);
}

export function resetUsage(token: string) {
  const user = users.get(token);
  if (!user) return;
  const { tokenCounts } = user;
  const counts = Object.entries(tokenCounts) as [ModelFamily, number][];
  counts.forEach(([model]) => (tokenCounts[model] = 0));
  usersToFlush.add(token);
}

/** Disables the given user, optionally providing a reason. */
export function disableUser(token: string, reason?: string) {
  const user = users.get(token);
  if (!user) return;
  user.disabledAt = Date.now();
  user.disabledReason = reason;
  usersToFlush.add(token);
}

export function getNextQuotaRefresh() {
  if (!quotaRefreshJob) return "never (manual refresh only)";
  return quotaRefreshJob.nextInvocation().getTime();
}

/**
 * Cleans up expired temporary tokens by disabling tokens past their access
 * expiry date and permanently deleting tokens three days after their access
 * expiry date.
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  let disabled = 0;
  let deleted = 0;
  for (const user of users.values()) {
    if (user.type !== "temporary") continue;
    if (user.expiresAt && user.expiresAt < now && !user.disabledAt) {
      disableUser(user.token, "Temporary token expired.");
      disabled++;
    }
    if (user.disabledAt && user.disabledAt + 72 * 60 * 60 * 1000 < now) {
      users.delete(user.token);
      usersToFlush.add(user.token);
      deleted++;
    }
  }
  log.trace({ disabled, deleted }, "Expired tokens cleaned up.");
}

function refreshAllQuotas() {
  let count = 0;
  for (const user of users.values()) {
    if (user.type === "temporary") continue;
    refreshQuota(user.token);
    count++;
  }
  log.info(
    { refreshed: count, nextRefresh: quotaRefreshJob!.nextInvocation() },
    "Token quotas refreshed."
  );
}

// TODO: Firebase persistence is pretend right now and just polls the in-memory
// store to sync it with Firebase when it changes. Will refactor to abstract
// persistence layer later so we can support multiple stores.
let firebaseTimeout: NodeJS.Timeout | undefined;

async function initFirebase() {
  log.info("Connecting to Firebase...");
  const app = getFirebaseApp();
  const db = admin.database(app);
  const usersRef = db.ref("users");
  const snapshot = await usersRef.once("value");
  const users: Record<string, User> | null = snapshot.val();
  firebaseTimeout = setInterval(flushUsers, 20 * 1000);
  if (!users) {
    log.info("No users found in Firebase.");
    return;
  }
  for (const token in users) {
    users[token].promptCountSinceStart = 0;
    users[token].tokenCountsSinceStart = { ...INITIAL_TOKENS };

    upsertUser(users[token]);
  }
  usersToFlush.clear();
  const numUsers = Object.keys(users).length;
  log.info({ users: numUsers }, "Loaded users from Firebase");
}

async function flushUsers() {
  const app = getFirebaseApp();
  const db = admin.database(app);
  const usersRef = db.ref("users");
  const updates: Record<string, User> = {};
  const deletions = [];

  for (const token of usersToFlush) {
    const user = users.get(token);
    if (!user) {
      deletions.push(token);
      continue;
    }
    updates[token] = user;
  }

  usersToFlush.clear();

  const numUpdates = Object.keys(updates).length + deletions.length;
  if (numUpdates === 0) {
    return;
  }

  await usersRef.update(updates);
  await Promise.all(deletions.map((token) => usersRef.child(token).remove()));
  log.info(
    { users: Object.keys(updates).length, deletions: deletions.length },
    "Flushed changes to Firebase"
  );
}

function getModelFamilyForQuotaUsage(
  model: string,
  api: APIFormat
): ModelFamily {
  // TODO: this seems incorrect
  if (model.includes("azure")) return getAzureOpenAIModelFamily(model);

  switch (api) {
    case "openai":
    case "openai-text":
    case "openai-image":
      return getOpenAIModelFamily(model);
    case "anthropic":
      return getClaudeModelFamily(model);
    case "google-ai":
      return getGoogleAIModelFamily(model);
    case "mistral-ai":
      return getMistralAIModelFamily(model);
    default:
      assertNever(api);
  }
}

function getRefreshCrontab() {
  switch (config.quotaRefreshPeriod!) {
    case "hourly":
      return "0 * * * *";
    case "daily":
      return "0 0 * * *";
    default:
      return config.quotaRefreshPeriod ?? "0 0 * * *";
  }
}

function hashIp(ip: string) {
  if (ip.startsWith("ip")) return ip;
  return `ip-${crypto.createHash("sha256").update(ip).digest("hex")}`;
}
