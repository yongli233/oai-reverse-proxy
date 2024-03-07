import crypto from "crypto";
import { Key, KeyProvider } from "..";
import { config } from "../../../config";
import { logger } from "../../../logger";
import type { AwsBedrockModelFamily } from "../../models";
import { AwsKeyChecker } from "./checker";
<<<<<<< HEAD
=======
import { HttpError } from "../../errors";
>>>>>>> upstream/main

// https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids-arns.html
export type AwsBedrockModel =
  | "anthropic.claude-v1"
  | "anthropic.claude-v2"
  | "anthropic.claude-instant-v1";

type AwsBedrockKeyUsage = {
  [K in AwsBedrockModelFamily as `${K}Tokens`]: number;
};

export interface AwsBedrockKey extends Key, AwsBedrockKeyUsage {
  readonly service: "aws";
  readonly modelFamilies: AwsBedrockModelFamily[];
  /** The time at which this key was last rate limited. */
  rateLimitedAt: number;
  /** The time until which this key is rate limited. */
  rateLimitedUntil: number;
  /**
   * The confirmed logging status of this key. This is "unknown" until we
   * receive a response from the AWS API. Keys which are logged, or not
   * confirmed as not being logged, won't be used unless ALLOW_AWS_LOGGING is
   * set.
   */
  awsLoggingStatus: "unknown" | "disabled" | "enabled";
<<<<<<< HEAD
=======
  sonnetEnabled: boolean;
>>>>>>> upstream/main
}

/**
 * Upon being rate limited, a key will be locked out for this many milliseconds
 * while we wait for other concurrent requests to finish.
 */
const RATE_LIMIT_LOCKOUT = 4000;
/**
 * Upon assigning a key, we will wait this many milliseconds before allowing it
 * to be used again. This is to prevent the queue from flooding a key with too
 * many requests while we wait to learn whether previous ones succeeded.
 */
const KEY_REUSE_DELAY = 500;

export class AwsBedrockKeyProvider implements KeyProvider<AwsBedrockKey> {
  readonly service = "aws";

  private keys: AwsBedrockKey[] = [];
  private checker?: AwsKeyChecker;
  private log = logger.child({ module: "key-provider", service: this.service });

  constructor() {
    const keyConfig = config.awsCredentials?.trim();
    if (!keyConfig) {
      this.log.warn(
        "AWS_CREDENTIALS is not set. AWS Bedrock API will not be available."
      );
      return;
    }
    let bareKeys: string[];
    bareKeys = [...new Set(keyConfig.split(",").map((k) => k.trim()))];
    for (const key of bareKeys) {
<<<<<<< HEAD
      this.addKey(key, true);
=======
      const newKey: AwsBedrockKey = {
        key,
        service: this.service,
        modelFamilies: ["aws-claude"],
        isDisabled: false,
        isRevoked: false,
        promptCount: 0,
        lastUsed: 0,
        rateLimitedAt: 0,
        rateLimitedUntil: 0,
        awsLoggingStatus: "unknown",
        hash: `aws-${crypto
          .createHash("sha256")
          .update(key)
          .digest("hex")
          .slice(0, 8)}`,
        lastChecked: 0,
        sonnetEnabled: true,
        ["aws-claudeTokens"]: 0,
      };
      this.keys.push(newKey);
>>>>>>> upstream/main
    }
    this.log.info({ keyCount: this.keys.length }, "Loaded AWS Bedrock keys.");
  }

<<<<<<< HEAD
  addKey(key: string, init: boolean): boolean {
    const hash = `aws-${crypto
      .createHash("sha256")
      .update(key)
      .digest("hex")
      .slice(0, 8)}`;

    if (!init) {
      const isExist = this.keys.find((k) => k.hash === hash);
      if (isExist) return false;
    }

    const newKey: AwsBedrockKey = {
      key,
      service: this.service,
      modelFamilies: ["aws-claude"],
      isDisabled: false,
      isRevoked: false,
      promptCount: 0,
      lastUsed: 0,
      rateLimitedAt: 0,
      rateLimitedUntil: 0,
      awsLoggingStatus: "unknown",
      hash: hash,
      lastChecked: 0,
      ["aws-claudeTokens"]: 0,
    };
    this.keys.push(newKey);
    return true;
  }

  removeKey(hash: string): boolean {
    const keyIndex = this.keys.findIndex((k) => k.hash === hash);
    if (keyIndex === -1) return false;

    this.keys.splice(keyIndex, 1);
    return true;
  }

=======
>>>>>>> upstream/main
  public init() {
    if (config.checkKeys) {
      this.checker = new AwsKeyChecker(this.keys, this.update.bind(this));
      this.checker.start();
    }
  }

  public list() {
    return this.keys.map((k) => Object.freeze({ ...k, key: undefined }));
  }

<<<<<<< HEAD
  public get(_model: AwsBedrockModel) {
    const availableKeys = this.keys.filter((k) => {
      const isNotLogged = k.awsLoggingStatus === "disabled";
      return !k.isDisabled && (isNotLogged || config.allowAwsLogging);
    });
    if (availableKeys.length === 0) {
      throw new Error("No AWS Bedrock keys available");
=======
  public get(model: AwsBedrockModel) {
    const availableKeys = this.keys.filter((k) => {
      const isNotLogged = k.awsLoggingStatus === "disabled";
      const needsSonnet = model.includes("sonnet");
      return (
        !k.isDisabled &&
        (isNotLogged || config.allowAwsLogging) &&
        (k.sonnetEnabled || !needsSonnet)
      );
    });
    if (availableKeys.length === 0) {
      throw new HttpError(
        402,
        "No keys available for this model. This proxy might not have Claude 3 Sonnet keys available."
      );
>>>>>>> upstream/main
    }

    // (largely copied from the OpenAI provider, without trial key support)
    // Select a key, from highest priority to lowest priority:
    // 1. Keys which are not rate limited
    //    a. If all keys were rate limited recently, select the least-recently
    //       rate limited key.
    // 3. Keys which have not been used in the longest time

    const now = Date.now();

    const keysByPriority = availableKeys.sort((a, b) => {
      const aRateLimited = now - a.rateLimitedAt < RATE_LIMIT_LOCKOUT;
      const bRateLimited = now - b.rateLimitedAt < RATE_LIMIT_LOCKOUT;

      if (aRateLimited && !bRateLimited) return 1;
      if (!aRateLimited && bRateLimited) return -1;
      if (aRateLimited && bRateLimited) {
        return a.rateLimitedAt - b.rateLimitedAt;
      }

      return a.lastUsed - b.lastUsed;
    });

    const selectedKey = keysByPriority[0];
    selectedKey.lastUsed = now;
    this.throttle(selectedKey.hash);
    return { ...selectedKey };
  }

  public disable(key: AwsBedrockKey) {
    const keyFromPool = this.keys.find((k) => k.hash === key.hash);
    if (!keyFromPool || keyFromPool.isDisabled) return;
    keyFromPool.isDisabled = true;
    this.log.warn({ key: key.hash }, "Key disabled");
  }

  public update(hash: string, update: Partial<AwsBedrockKey>) {
    const keyFromPool = this.keys.find((k) => k.hash === hash)!;
    Object.assign(keyFromPool, { lastChecked: Date.now(), ...update });
  }

  public available() {
    return this.keys.filter((k) => !k.isDisabled).length;
  }

  public incrementUsage(hash: string, _model: string, tokens: number) {
    const key = this.keys.find((k) => k.hash === hash);
    if (!key) return;
    key.promptCount++;
    key["aws-claudeTokens"] += tokens;
  }

  public getLockoutPeriod() {
    // TODO: same exact behavior for three providers, should be refactored
    const activeKeys = this.keys.filter((k) => !k.isDisabled);
    // Don't lock out if there are no keys available or the queue will stall.
    // Just let it through so the add-key middleware can throw an error.
    if (activeKeys.length === 0) return 0;

    const now = Date.now();
    const rateLimitedKeys = activeKeys.filter((k) => now < k.rateLimitedUntil);
    const anyNotRateLimited = rateLimitedKeys.length < activeKeys.length;

    if (anyNotRateLimited) return 0;

    // If all keys are rate-limited, return time until the first key is ready.
    return Math.min(...activeKeys.map((k) => k.rateLimitedUntil - now));
  }

  /**
   * This is called when we receive a 429, which means there are already five
   * concurrent requests running on this key. We don't have any information on
   * when these requests will resolve, so all we can do is wait a bit and try
   * again. We will lock the key for 2 seconds after getting a 429 before
   * retrying in order to give the other requests a chance to finish.
   */
  public markRateLimited(keyHash: string) {
    this.log.debug({ key: keyHash }, "Key rate limited");
    const key = this.keys.find((k) => k.hash === keyHash)!;
    const now = Date.now();
    key.rateLimitedAt = now;
    key.rateLimitedUntil = now + RATE_LIMIT_LOCKOUT;
  }

  public recheck() {
    this.keys.forEach(({ hash }) =>
      this.update(hash, { lastChecked: 0, isDisabled: false, isRevoked: false })
    );
    this.checker?.scheduleNextCheck();
  }

  /**
   * Applies a short artificial delay to the key upon dequeueing, in order to
   * prevent it from being immediately assigned to another request before the
   * current one can be dispatched.
   **/
  private throttle(hash: string) {
    const now = Date.now();
    const key = this.keys.find((k) => k.hash === hash)!;

    const currentRateLimit = key.rateLimitedUntil;
    const nextRateLimit = now + KEY_REUSE_DELAY;

    key.rateLimitedAt = now;
    key.rateLimitedUntil = Math.max(currentRateLimit, nextRateLimit);
  }
}
