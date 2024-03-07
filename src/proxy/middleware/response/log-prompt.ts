import { Request } from "express";
import { config } from "../../../config";
import { logQueue } from "../../../shared/prompt-logging";
import {
  getCompletionFromBody,
  getModelFromBody,
  isImageGenerationRequest,
  isTextGenerationRequest,
} from "../common";
import { ProxyResHandlerWithBody } from ".";
import { assertNever } from "../../../shared/utils";
import {
  AnthropicChatMessage,
  flattenAnthropicMessages,
  MistralAIChatMessage,
  OpenAIChatMessage,
} from "../../../shared/api-schemas";
import { APIFormat } from "../../../shared/key-management";

/** If prompt logging is enabled, enqueues the prompt for logging. */
export const logPrompt: ProxyResHandlerWithBody = async (
  _proxyRes,
  req,
  _res,
  responseBody
) => {
  if (!config.promptLogging) {
    return;
  }
  if (typeof responseBody !== "object") {
    throw new Error("Expected body to be an object");
  }

  const loggable =
    isTextGenerationRequest(req) || isImageGenerationRequest(req);
  if (!loggable) return;

  const promptPayload = getPromptForRequest(req, responseBody);
  const promptFlattened = flattenMessages(promptPayload, req.outboundApi);
  const response = getCompletionFromBody(req, responseBody);
  const model = getModelFromBody(req, responseBody);

  logQueue.enqueue({
    endpoint: req.inboundApi,
    promptRaw: JSON.stringify(promptPayload),
    promptFlattened,
    model,
    response,
  });
};

type OaiImageResult = {
  prompt: string;
  size: string;
  style: string;
  quality: string;
  revisedPrompt?: string;
};

const getPromptForRequest = (
  req: Request,
  responseBody: Record<string, any>
):
  | string
  | OpenAIChatMessage[]
  | AnthropicChatMessage[]
  | MistralAIChatMessage[]
  | OaiImageResult => {
  // Since the prompt logger only runs after the request has been proxied, we
  // can assume the body has already been transformed to the target API's
  // format.
  switch (req.outboundApi) {
    case "openai":
    case "mistral-ai":
    case "anthropic-chat":
      return req.body.messages;
    case "openai-text":
      return req.body.prompt;
    case "openai-image":
      return {
        prompt: req.body.prompt,
        size: req.body.size,
        style: req.body.style,
        quality: req.body.quality,
        revisedPrompt: responseBody.data[0].revised_prompt,
      };
    case "anthropic-text":
      return req.body.prompt;
    case "google-ai":
      return req.body.prompt.text;
    default:
      assertNever(req.outboundApi);
  }
};

const flattenMessages = (
  val:
    | string
    | OaiImageResult
    | OpenAIChatMessage[]
    | AnthropicChatMessage[]
    | MistralAIChatMessage[],
  format: APIFormat
): string => {
  if (typeof val === "string") {
    return val.trim();
  }
  if (format === "anthropic-chat") {
    return flattenAnthropicMessages(val as AnthropicChatMessage[]);
  }
  if (Array.isArray(val)) {
    return val
      .map(({ content, role }) => {
        const text = Array.isArray(content)
          ? content
              .map((c) => {
                if ("text" in c) return c.text;
                if ("image_url" in c) return "(( Attached Image ))";
                if ("source" in c) return "(( Attached Image ))";
                return "(( Unsupported Content ))";
              })
              .join("\n")
          : content;
        return `${role}: ${text}`;
      })
      .join("\n");
  }
  return val.prompt.trim();
};
