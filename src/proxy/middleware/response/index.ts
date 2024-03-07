/* This file is fucking horrendous, sorry */
import { Request, Response } from "express";
import * as http from "http";
import util from "util";
import zlib from "zlib";
import { enqueue, trackWaitTime } from "../../queue";
import { HttpError } from "../../../shared/errors";
import { keyPool } from "../../../shared/key-management";
import { getOpenAIModelFamily } from "../../../shared/models";
import { countTokens } from "../../../shared/tokenization";
import {
  incrementPromptCount,
  incrementTokenCount,
} from "../../../shared/users/user-store";
import { assertNever } from "../../../shared/utils";
import { refundLastAttempt } from "../../rate-limit";
import {
  getCompletionFromBody,
  isImageGenerationRequest,
  isTextGenerationRequest,
<<<<<<< HEAD
  writeErrorResponse,
=======
  sendProxyError,
>>>>>>> upstream/main
} from "../common";
import { handleStreamedResponse } from "./handle-streamed-response";
import { logPrompt } from "./log-prompt";
import { saveImage } from "./save-image";

const DECODER_MAP = {
  gzip: util.promisify(zlib.gunzip),
  deflate: util.promisify(zlib.inflate),
  br: util.promisify(zlib.brotliDecompress),
};

const isSupportedContentEncoding = (
  contentEncoding: string
): contentEncoding is keyof typeof DECODER_MAP => {
  return contentEncoding in DECODER_MAP;
};

export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}

/**
 * Either decodes or streams the entire response body and then passes it as the
 * last argument to the rest of the middleware stack.
 */
export type RawResponseBodyHandler = (
  proxyRes: http.IncomingMessage,
  req: Request,
  res: Response
) => Promise<string | Record<string, any>>;
export type ProxyResHandlerWithBody = (
  proxyRes: http.IncomingMessage,
  req: Request,
  res: Response,
  /**
   * This will be an object if the response content-type is application/json,
   * or if the response is a streaming response. Otherwise it will be a string.
   */
  body: string | Record<string, any>
) => Promise<void>;
export type ProxyResMiddleware = ProxyResHandlerWithBody[];

/**
 * Returns a on.proxyRes handler that executes the given middleware stack after
 * the common proxy response handlers have processed the response and decoded
 * the body.  Custom middleware won't execute if the response is determined to
 * be an error from the upstream service as the response will be taken over by
 * the common error handler.
 *
 * For streaming responses, the handleStream middleware will block remaining
 * middleware from executing as it consumes the stream and forwards events to
 * the client. Once the stream is closed, the finalized body will be attached
 * to res.body and the remaining middleware will execute.
 */
export const createOnProxyResHandler = (apiMiddleware: ProxyResMiddleware) => {
  return async (
    proxyRes: http.IncomingMessage,
    req: Request,
    res: Response
  ) => {
    const initialHandler = req.isStreaming
      ? handleStreamedResponse
      : decodeResponseBody;

    let lastMiddleware = initialHandler.name;

    try {
      const body = await initialHandler(proxyRes, req, res);

      const middlewareStack: ProxyResMiddleware = [];

      if (req.isStreaming) {
        // `handleStreamedResponse` writes to the response and ends it, so
        // we can only execute middleware that doesn't write to the response.
        middlewareStack.push(
          trackRateLimit,
          countResponseTokens,
          incrementUsage,
          logPrompt
        );
      } else {
        middlewareStack.push(
          trackRateLimit,
          handleUpstreamErrors,
          countResponseTokens,
          incrementUsage,
          copyHttpHeaders,
          saveImage,
          logPrompt,
          ...apiMiddleware
        );
      }

      for (const middleware of middlewareStack) {
        lastMiddleware = middleware.name;
        await middleware(proxyRes, req, res, body);
      }

      trackWaitTime(req);
    } catch (error) {
      // Hack: if the error is a retryable rate-limit error, the request has
      // been re-enqueued and we can just return without doing anything else.
      if (error instanceof RetryableError) {
        return;
      }

      // Already logged and responded to the client by handleUpstreamErrors
      if (error instanceof HttpError) {
        if (!res.writableEnded) res.end();
        return;
      }

      const { stack, message } = error;
      const info = { stack, lastMiddleware, key: req.key?.hash };
      const description = `Error while executing proxy response middleware: ${lastMiddleware} (${message})`;

      if (res.headersSent) {
        req.log.error(info, description);
        if (!res.writableEnded) res.end();
        return;
      } else {
        req.log.error(info, description);
        res
          .status(500)
          .json({ error: "Internal server error", proxy_note: description });
      }
    }
  };
};

async function reenqueueRequest(req: Request) {
  req.log.info(
    { key: req.key?.hash, retryCount: req.retryCount },
    `Re-enqueueing request due to retryable error`
  );
  req.retryCount++;
  await enqueue(req);
}

/**
 * Handles the response from the upstream service and decodes the body if
 * necessary.  If the response is JSON, it will be parsed and returned as an
 * object.  Otherwise, it will be returned as a string.
 * @throws {Error} Unsupported content-encoding or invalid application/json body
 */
export const decodeResponseBody: RawResponseBodyHandler = async (
  proxyRes,
  req,
  res
) => {
  if (req.isStreaming) {
    const err = new Error("decodeResponseBody called for a streaming request.");
    req.log.error({ stack: err.stack, api: req.inboundApi }, err.message);
    throw err;
  }

  return new Promise<string>((resolve, reject) => {
    let chunks: Buffer[] = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", async () => {
      let body = Buffer.concat(chunks);

      const contentEncoding = proxyRes.headers["content-encoding"];
      if (contentEncoding) {
        if (isSupportedContentEncoding(contentEncoding)) {
          const decoder = DECODER_MAP[contentEncoding];
          // @ts-ignore - started failing after upgrading TypeScript, don't care
          // as it was never a problem.
          body = await decoder(body);
        } else {
<<<<<<< HEAD
          const errorMessage = `Proxy received response with unsupported content-encoding: ${contentEncoding}`;
          req.log.warn({ contentEncoding, key: req.key?.hash }, errorMessage);
          writeErrorResponse(req, res, 500, "Internal Server Error", {
            error: errorMessage,
            contentEncoding,
          });
          return reject(errorMessage);
=======
          const error = `Proxy received response with unsupported content-encoding: ${contentEncoding}`;
          req.log.warn({ contentEncoding, key: req.key?.hash }, error);
          sendProxyError(req, res, 500, "Internal Server Error", {
            error,
            contentEncoding,
          });
          return reject(error);
>>>>>>> upstream/main
        }
      }

      try {
        if (proxyRes.headers["content-type"]?.includes("application/json")) {
          const json = JSON.parse(body.toString());
          return resolve(json);
        }
        return resolve(body.toString());
<<<<<<< HEAD
      } catch (error: any) {
        const errorMessage = `Proxy received response with invalid JSON: ${error.message}`;
        req.log.warn({ error: error.stack, key: req.key?.hash }, errorMessage);
        writeErrorResponse(req, res, 500, "Internal Server Error", {
          error: errorMessage,
        });
        return reject(errorMessage);
=======
      } catch (e) {
        const msg = `Proxy received response with invalid JSON: ${e.message}`;
        req.log.warn({ error: e.stack, key: req.key?.hash }, msg);
        sendProxyError(req, res, 500, "Internal Server Error", { error: msg });
        return reject(msg);
>>>>>>> upstream/main
      }
    });
  });
};

type ProxiedErrorPayload = {
  error?: Record<string, any>;
  message?: string;
  proxy_note?: string;
};

/**
 * Handles non-2xx responses from the upstream service.  If the proxied response
 * is an error, this will respond to the client with an error payload and throw
 * an error to stop the middleware stack.
 * On 429 errors, if request queueing is enabled, the request will be silently
 * re-enqueued.  Otherwise, the request will be rejected with an error payload.
 * @throws {HttpError} On HTTP error status code from upstream service
 */
const handleUpstreamErrors: ProxyResHandlerWithBody = async (
  proxyRes,
  req,
  res,
  body
) => {
  const statusCode = proxyRes.statusCode || 500;
  const statusMessage = proxyRes.statusMessage || "Internal Server Error";

  if (statusCode < 400) {
    return;
  }

  let errorPayload: ProxiedErrorPayload;
  const tryAgainMessage = keyPool.available(req.body?.model)
    ? `There may be more keys available for this model; try again in a few seconds.`
    : "There are no more keys available for this model.";

  try {
    assertJsonResponse(body);
    errorPayload = body;
  } catch (parseError) {
    // Likely Bad Gateway or Gateway Timeout from upstream's reverse proxy
    const hash = req.key?.hash;
    req.log.warn({ statusCode, statusMessage, key: hash }, parseError.message);

    const errorObject = {
      error: parseError.message,
      status: statusCode,
      statusMessage,
      proxy_note: `Proxy got back an error, but it was not in JSON format. This is likely a temporary problem with the upstream service.`,
    };

<<<<<<< HEAD
    writeErrorResponse(req, res, statusCode, statusMessage, errorObject);
=======
    sendProxyError(req, res, statusCode, statusMessage, errorObject);
>>>>>>> upstream/main
    throw new HttpError(statusCode, parseError.message);
  }

  const errorType =
    errorPayload.error?.code ||
    errorPayload.error?.type ||
    getAwsErrorType(proxyRes.headers["x-amzn-errortype"]);

  req.log.warn(
    { statusCode, type: errorType, errorPayload, key: req.key?.hash },
    `Received error response from upstream. (${proxyRes.statusMessage})`
  );

  const service = req.key!.service;
  if (service === "aws") {
    // Try to standardize the error format for AWS
    errorPayload.error = { message: errorPayload.message, type: errorType };
    delete errorPayload.message;
  }

  if (statusCode === 400) {
    // Bad request. For OpenAI, this is usually due to prompt length.
    // For Anthropic, this is usually due to missing preamble.
    switch (service) {
      case "openai":
      case "google-ai":
      case "mistral-ai":
      case "azure":
        const filteredCodes = ["content_policy_violation", "content_filter"];
        if (filteredCodes.includes(errorPayload.error?.code)) {
          errorPayload.proxy_note = `Request was filtered by the upstream API's content moderation system. Modify your prompt and try again.`;
          refundLastAttempt(req);
        } else if (errorPayload.error?.code === "billing_hard_limit_reached") {
          // For some reason, some models return this 400 error instead of the
          // same 429 billing error that other models return.
          await handleOpenAIRateLimitError(req, tryAgainMessage, errorPayload);
        } else {
          errorPayload.proxy_note = `The upstream API rejected the request. Your prompt may be too long for ${req.body?.model}.`;
        }
        break;
      case "anthropic":
      case "aws":
        await handleAnthropicBadRequestError(req, errorPayload);
        break;
      default:
        assertNever(service);
    }
  } else if (statusCode === 401) {
    // Key is invalid or was revoked
    keyPool.disable(req.key!, "revoked");
    errorPayload.proxy_note = `API key is invalid or revoked. ${tryAgainMessage}`;
  } else if (statusCode === 403) {
    if (service === "anthropic") {
      keyPool.disable(req.key!, "revoked");
      errorPayload.proxy_note = `API key is invalid or revoked. ${tryAgainMessage}`;
      return;
    }
    switch (errorType) {
      case "UnrecognizedClientException":
        // Key is invalid.
        keyPool.disable(req.key!, "revoked");
        errorPayload.proxy_note = `API key is invalid or revoked. ${tryAgainMessage}`;
        break;
      case "AccessDeniedException":
<<<<<<< HEAD
        req.log.error(
          { key: req.key?.hash, model: req.body?.model },
          "Disabling key due to AccessDeniedException when invoking model. If credentials are valid, check IAM permissions."
        );
        keyPool.disable(req.key!, "revoked");
        errorPayload.proxy_note = `API key doesn't have access to the requested resource.`;
=======
        const isModelAccessError =
          errorPayload.error?.message?.includes(`specified model ID`);
        if (!isModelAccessError) {
          req.log.error(
            { key: req.key?.hash, model: req.body?.model },
            "Disabling key due to AccessDeniedException when invoking model. If credentials are valid, check IAM permissions."
          );
          keyPool.disable(req.key!, "revoked");
        }
        errorPayload.proxy_note = `API key doesn't have access to the requested resource. Model ID: ${req.body?.model}`;
>>>>>>> upstream/main
        break;
      default:
        errorPayload.proxy_note = `Received 403 error. Key may be invalid.`;
    }
  } else if (statusCode === 429) {
    switch (service) {
      case "openai":
        await handleOpenAIRateLimitError(req, tryAgainMessage, errorPayload);
        break;
      case "anthropic":
        await handleAnthropicRateLimitError(req, errorPayload);
        break;
      case "aws":
        await handleAwsRateLimitError(req, errorPayload);
        break;
      case "azure":
      case "mistral-ai":
        await handleAzureRateLimitError(req, errorPayload);
        break;
      case "google-ai":
        await handleGoogleAIRateLimitError(req, errorPayload);
        break;
      default:
        assertNever(service);
    }
  } else if (statusCode === 404) {
    // Most likely model not found
    switch (service) {
      case "openai":
        if (errorPayload.error?.code === "model_not_found") {
          const requestedModel = req.body.model;
          const modelFamily = getOpenAIModelFamily(requestedModel);
          errorPayload.proxy_note = `The key assigned to your prompt does not support the requested model (${requestedModel}, family: ${modelFamily}).`;
          req.log.error(
            { key: req.key?.hash, model: requestedModel, modelFamily },
            "Prompt was routed to a key that does not support the requested model."
          );
        }
        break;
      case "anthropic":
        errorPayload.proxy_note = `The requested Claude model might not exist, or the key might not be provisioned for it.`;
        break;
      case "google-ai":
        errorPayload.proxy_note = `The requested Google AI model might not exist, or the key might not be provisioned for it.`;
        break;
      case "mistral-ai":
        errorPayload.proxy_note = `The requested Mistral AI model might not exist, or the key might not be provisioned for it.`;
        break;
      case "aws":
        errorPayload.proxy_note = `The requested AWS resource might not exist, or the key might not have access to it.`;
        break;
      case "azure":
        errorPayload.proxy_note = `The assigned Azure deployment does not support the requested model.`;
        break;
      default:
        assertNever(service);
    }
  } else {
    errorPayload.proxy_note = `Unrecognized error from upstream service.`;
  }

  // Some OAI errors contain the organization ID, which we don't want to reveal.
  if (errorPayload.error?.message) {
    errorPayload.error.message = errorPayload.error.message.replace(
      /org-.{24}/gm,
      "org-xxxxxxxxxxxxxxxxxxx"
    );
  }

<<<<<<< HEAD
  writeErrorResponse(req, res, statusCode, statusMessage, errorPayload);
=======
  sendProxyError(req, res, statusCode, statusMessage, errorPayload);
  // This is bubbled up to onProxyRes's handler for logging but will not trigger
  // a write to the response as `sendProxyError` has just done that.
>>>>>>> upstream/main
  throw new HttpError(statusCode, errorPayload.error?.message);
};

async function handleAnthropicBadRequestError(
  req: Request,
  errorPayload: ProxiedErrorPayload
) {
  const { error } = errorPayload;
  const isMissingPreamble = error?.message.startsWith(
    `prompt must start with "\n\nHuman:" turn`
  );

  // Some keys mandate a \n\nHuman: preamble, which we can add and retry
  if (isMissingPreamble) {
    req.log.warn(
      { key: req.key?.hash },
      "Request failed due to missing preamble. Key will be marked as such for subsequent requests."
    );
    keyPool.update(req.key!, { requiresPreamble: true });
    await reenqueueRequest(req);
    throw new RetryableError("Claude request re-enqueued to add preamble.");
  }

<<<<<<< HEAD
  // Only affects Anthropic keys
  // {"type":"error","error":{"type":"invalid_request_error","message":"Usage blocked until 2024-03-01T00:00:00+00:00 due to user specified spend limits."}}
  const isOverQuota = error?.message?.match(/usage blocked until/i);
=======
  // {"type":"error","error":{"type":"invalid_request_error","message":"Usage blocked until 2024-03-01T00:00:00+00:00 due to user specified spend limits."}}
  // {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Claude API. Please go to Plans & Billing to upgrade or purchase credits."}}
  const isOverQuota =
    error?.message?.match(/usage blocked until/i) ||
    error?.message?.match(/credit balance is too low/i);
>>>>>>> upstream/main
  if (isOverQuota) {
    req.log.warn(
      { key: req.key?.hash, message: error?.message },
      "Anthropic key has hit spending limit and will be disabled."
    );
    keyPool.disable(req.key!, "quota");
    errorPayload.proxy_note = `Assigned key has hit its spending limit. ${error?.message}`;
    return;
  }

<<<<<<< HEAD
  errorPayload.proxy_note = `Unrecognized 400 Bad Request error from the API.`;
=======
  const isDisabled = error?.message?.match(/organization has been disabled/i);
  if (isDisabled) {
    req.log.warn(
      { key: req.key?.hash, message: error?.message },
      "Anthropic key has been disabled."
    );
    keyPool.disable(req.key!, "revoked");
    errorPayload.proxy_note = `Assigned key has been disabled. ${error?.message}`;
    return;
  }

  errorPayload.proxy_note = `Unrecognized error from the API. (${error?.message})`;
>>>>>>> upstream/main
}

async function handleAnthropicRateLimitError(
  req: Request,
  errorPayload: ProxiedErrorPayload
) {
  if (errorPayload.error?.type === "rate_limit_error") {
    keyPool.markRateLimited(req.key!);
    await reenqueueRequest(req);
    throw new RetryableError("Claude rate-limited request re-enqueued.");
  } else {
    errorPayload.proxy_note = `Unrecognized 429 Too Many Requests error from the API.`;
  }
}

async function handleAwsRateLimitError(
  req: Request,
  errorPayload: ProxiedErrorPayload
) {
  const errorType = errorPayload.error?.type;
  switch (errorType) {
    case "ThrottlingException":
      keyPool.markRateLimited(req.key!);
      await reenqueueRequest(req);
      throw new RetryableError("AWS rate-limited request re-enqueued.");
    case "ModelNotReadyException":
      errorPayload.proxy_note = `The requested model is overloaded. Try again in a few seconds.`;
      break;
    default:
      errorPayload.proxy_note = `Unrecognized rate limit error from AWS. (${errorType})`;
  }
}

async function handleOpenAIRateLimitError(
  req: Request,
  tryAgainMessage: string,
  errorPayload: ProxiedErrorPayload
): Promise<Record<string, any>> {
  const type = errorPayload.error?.type;
  switch (type) {
    case "insufficient_quota":
    case "invalid_request_error": // this is the billing_hard_limit_reached error seen in some cases
      // Billing quota exceeded (key is dead, disable it)
      keyPool.disable(req.key!, "quota");
      errorPayload.proxy_note = `Assigned key's quota has been exceeded. ${tryAgainMessage}`;
      break;
    case "access_terminated":
      // Account banned (key is dead, disable it)
      keyPool.disable(req.key!, "revoked");
      errorPayload.proxy_note = `Assigned key has been banned by OpenAI for policy violations. ${tryAgainMessage}`;
      break;
    case "billing_not_active":
      // Key valid but account billing is delinquent
      keyPool.disable(req.key!, "quota");
      errorPayload.proxy_note = `Assigned key has been disabled due to delinquent billing. ${tryAgainMessage}`;
      break;
    case "requests":
    case "tokens":
      keyPool.markRateLimited(req.key!);
      if (errorPayload.error?.message?.match(/on requests per day/)) {
        // This key has a very low rate limit, so we can't re-enqueue it.
        errorPayload.proxy_note = `Assigned key has reached its per-day request limit for this model. Try another model.`;
        break;
      }

      // Per-minute request or token rate limit is exceeded, which we can retry
      await reenqueueRequest(req);
      throw new RetryableError("Rate-limited request re-enqueued.");
    // WIP/nonfunctional
    // case "tokens_usage_based":
    //   // Weird new rate limit type that seems limited to preview models.
    //   // Distinct from `tokens` type. Can be per-minute or per-day.
    //
    //   // I've seen reports of this error for 500k tokens/day and 10k tokens/min.
    //   // 10k tokens per minute is problematic, because this is much less than
    //   // GPT4-Turbo's max context size for a single prompt and is effectively a
    //   // cap on the max context size for just that key+model, which the app is
    //   // not able to deal with.
    //
    //   // Similarly if there is a 500k tokens per day limit and 450k tokens have
    //   // been used today, the max context for that key becomes 50k tokens until
    //   // the next day and becomes progressively smaller as more tokens are used.
    //
    //   // To work around these keys we will first retry the request a few times.
    //   // After that we will reject the request, and if it's a per-day limit we
    //   // will also disable the key.
    //
    //   // "Rate limit reached for gpt-4-1106-preview in organization org-xxxxxxxxxxxxxxxxxxx on tokens_usage_based per day: Limit 500000, Used 460000, Requested 50000"
    //   // "Rate limit reached for gpt-4-1106-preview in organization org-xxxxxxxxxxxxxxxxxxx on tokens_usage_based per min: Limit 10000, Requested 40000"
    //
    //   const regex =
    //     /Rate limit reached for .+ in organization .+ on \w+ per (day|min): Limit (\d+)(?:, Used (\d+))?, Requested (\d+)/;
    //   const [, period, limit, used, requested] =
    //     errorPayload.error?.message?.match(regex) || [];
    //
    //   req.log.warn(
    //     { key: req.key?.hash, period, limit, used, requested },
    //     "Received `tokens_usage_based` rate limit error from OpenAI."
    //   );
    //
    //   if (!period || !limit || !requested) {
    //     errorPayload.proxy_note = `Unrecognized rate limit error from OpenAI. (${errorPayload.error?.message})`;
    //     break;
    //   }
    //
    //   if (req.retryCount < 2) {
    //     await reenqueueRequest(req);
    //     throw new RetryableError("Rate-limited request re-enqueued.");
    //   }
    //
    //   if (period === "min") {
    //     errorPayload.proxy_note = `Assigned key can't be used for prompts longer than ${limit} tokens, and no other keys are available right now. Reduce the length of your prompt or try again in a few minutes.`;
    //   } else {
    //     errorPayload.proxy_note = `Assigned key  has reached its per-day request limit for this model. Try another model.`;
    //   }
    //
    //   keyPool.markRateLimited(req.key!);
    //   break;
    default:
      errorPayload.proxy_note = `This is likely a temporary error with OpenAI. Try again in a few seconds.`;
      break;
  }
  return errorPayload;
}

async function handleAzureRateLimitError(
  req: Request,
  errorPayload: ProxiedErrorPayload
) {
  const code = errorPayload.error?.code;
  switch (code) {
    case "429":
      keyPool.markRateLimited(req.key!);
      await reenqueueRequest(req);
      throw new RetryableError("Rate-limited request re-enqueued.");
    default:
      errorPayload.proxy_note = `Unrecognized rate limit error from Azure (${code}). Please report this.`;
      break;
  }
}

//{"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}
async function handleGoogleAIRateLimitError(
  req: Request,
  errorPayload: ProxiedErrorPayload
) {
  const status = errorPayload.error?.status;
  switch (status) {
    case "RESOURCE_EXHAUSTED":
      keyPool.markRateLimited(req.key!);
      await reenqueueRequest(req);
      throw new RetryableError("Rate-limited request re-enqueued.");
    default:
      errorPayload.proxy_note = `Unrecognized rate limit error from Google AI (${status}). Please report this.`;
      break;
  }
}

const incrementUsage: ProxyResHandlerWithBody = async (_proxyRes, req) => {
  if (isTextGenerationRequest(req) || isImageGenerationRequest(req)) {
    const model = req.body.model;
    const tokensUsed = req.promptTokens! + req.outputTokens!;
    req.log.debug(
      {
        model,
        tokensUsed,
        promptTokens: req.promptTokens,
        outputTokens: req.outputTokens,
      },
      `Incrementing usage for model`
    );
    keyPool.incrementUsage(req.key!, model, tokensUsed);
    if (req.user) {
<<<<<<< HEAD
      incrementPromptCount(req.user.token, req.ip);
=======
      incrementPromptCount(req.user.token);
>>>>>>> upstream/main
      incrementTokenCount(req.user.token, model, req.outboundApi, tokensUsed);
    }
  }
};

const countResponseTokens: ProxyResHandlerWithBody = async (
  _proxyRes,
  req,
  _res,
  body
) => {
  if (req.outboundApi === "openai-image") {
    req.outputTokens = req.promptTokens;
    req.promptTokens = 0;
    return;
  }

  // This function is prone to breaking if the upstream API makes even minor
  // changes to the response format, especially for SSE responses. If you're
  // seeing errors in this function, check the reassembled response body from
  // handleStreamedResponse to see if the upstream API has changed.
  try {
    assertJsonResponse(body);
    const service = req.outboundApi;
    const completion = getCompletionFromBody(req, body);
    const tokens = await countTokens({ req, completion, service });

    req.log.debug(
      { service, tokens, prevOutputTokens: req.outputTokens },
      `Counted tokens for completion`
    );
    if (req.tokenizerInfo) {
      req.tokenizerInfo.completion_tokens = tokens;
    }

    req.outputTokens = tokens.token_count;
  } catch (error) {
    req.log.warn(
      error,
      "Error while counting completion tokens; assuming `max_output_tokens`"
    );
    // req.outputTokens will already be set to `max_output_tokens` from the
    // prompt counting middleware, so we don't need to do anything here.
  }
};

const trackRateLimit: ProxyResHandlerWithBody = async (proxyRes, req) => {
  keyPool.updateRateLimits(req.key!, proxyRes.headers);
};

const copyHttpHeaders: ProxyResHandlerWithBody = async (
  proxyRes,
  _req,
  res
) => {
  Object.keys(proxyRes.headers).forEach((key) => {
    // Omit content-encoding because we will always decode the response body
    if (key === "content-encoding") {
      return;
    }
    // We're usually using res.json() to send the response, which causes express
    // to set content-length. That's not valid for chunked responses and some
    // clients will reject it so we need to omit it.
    if (key === "transfer-encoding") {
      return;
    }
    res.setHeader(key, proxyRes.headers[key] as string);
  });
};

function getAwsErrorType(header: string | string[] | undefined) {
  const val = String(header).match(/^(\w+):?/)?.[1];
  return val || String(header);
}

function assertJsonResponse(body: any): asserts body is Record<string, any> {
  if (typeof body !== "object") {
    throw new Error("Expected response to be an object");
  }
}
