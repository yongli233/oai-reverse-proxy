import { Transform, TransformOptions } from "stream";
import { logger } from "../../../../logger";
import { APIFormat } from "../../../../shared/key-management";
import { assertNever } from "../../../../shared/utils";
import {
  anthropicChatToOpenAI,
  anthropicChatToAnthropicV2,
  anthropicV1ToOpenAI,
  AnthropicV2StreamEvent,
  anthropicV2ToOpenAI,
  googleAIToOpenAI,
  OpenAIChatCompletionStreamEvent,
  openAITextToOpenAIChat,
  passthroughToOpenAI,
  StreamingCompletionTransformer,
} from "./index";

type SSEMessageTransformerOptions = TransformOptions & {
  requestedModel: string;
  requestId: string;
  inputFormat: APIFormat;
  inputApiVersion?: string;
  outputFormat?: APIFormat;
  logger: typeof logger;
};

/**
 * Transforms SSE messages from one API format to OpenAI chat.completion.chunks.
 * Emits the original string SSE message as an "originalMessage" event.
 */
export class SSEMessageTransformer extends Transform {
  private lastPosition: number;
  private transformState: any;
  private msgCount: number;
  private readonly inputFormat: APIFormat;
  private readonly transformFn: StreamingCompletionTransformer<
    // TODO: Refactor transformers to not assume only OpenAI events as output
    OpenAIChatCompletionStreamEvent | AnthropicV2StreamEvent
  >;
  private readonly log;
  private readonly fallbackId: string;
  private readonly fallbackModel: string;

  constructor(options: SSEMessageTransformerOptions) {
    super({ ...options, readableObjectMode: true });
    this.log = options.logger?.child({ module: "sse-transformer" });
    this.lastPosition = 0;
    this.msgCount = 0;
    this.transformFn = getTransformer(
      options.inputFormat,
      options.inputApiVersion,
      options.outputFormat
    );
    this.inputFormat = options.inputFormat;
    this.fallbackId = options.requestId;
    this.fallbackModel = options.requestedModel;
    this.log.debug(
      {
        fn: this.transformFn.name,
        format: options.inputFormat,
        version: options.inputApiVersion,
      },
      "Selected SSE transformer"
    );
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: Function) {
    try {
      const originalMessage = chunk.toString();
      const {
        event: transformedMessage,
        position: newPosition,
        state,
      } = this.transformFn({
        data: originalMessage,
        lastPosition: this.lastPosition,
        index: this.msgCount++,
        fallbackId: this.fallbackId,
        fallbackModel: this.fallbackModel,
        state: this.transformState,
      });
      this.lastPosition = newPosition;
      this.transformState = state;

      // Special case for Azure OpenAI, which is 99% the same as OpenAI but
      // sometimes emits an extra event at the beginning of the stream with the
      // content moderation system's response to the prompt. A lot of frontends
      // don't expect this and neither does our event aggregator so we drop it.
      if (this.inputFormat === "openai" && this.msgCount <= 1) {
        if (originalMessage.includes("prompt_filter_results")) {
          this.log.debug("Dropping Azure OpenAI content moderation SSE event");
          return callback();
        }
      }

      this.emit("originalMessage", originalMessage);

      // Some events may not be transformed, e.g. ping events
      if (!transformedMessage) return callback();

      if (this.msgCount === 1 && eventIsOpenAIEvent(transformedMessage)) {
        // TODO: does this need to be skipped for passthroughToOpenAI?
        this.push(createInitialMessage(transformedMessage));
      }
      this.push(transformedMessage);
      callback();
    } catch (err) {
      err.lastEvent = chunk?.toString();
      this.log.error(err, "Error transforming SSE message");
      callback(err);
    }
  }
}

function eventIsOpenAIEvent(
  event: any
): event is OpenAIChatCompletionStreamEvent {
  return event?.object === "chat.completion.chunk";
}

function getTransformer(
  responseApi: APIFormat,
  version?: string,
  // There's only one case where we're not transforming back to OpenAI, which is
  // Anthropic Chat response -> Anthropic Text request. This parameter is only
  // used for that case.
  requestApi: APIFormat = "openai"
): StreamingCompletionTransformer<
  OpenAIChatCompletionStreamEvent | AnthropicV2StreamEvent
> {
  switch (responseApi) {
    case "openai":
    case "mistral-ai":
      return passthroughToOpenAI;
    case "openai-text":
      return openAITextToOpenAIChat;
    case "anthropic-text":
      return version === "2023-01-01"
        ? anthropicV1ToOpenAI
        : anthropicV2ToOpenAI;
    case "anthropic-chat":
      return requestApi === "anthropic-text"
        ? anthropicChatToAnthropicV2
        : anthropicChatToOpenAI;
    case "google-ai":
      return googleAIToOpenAI;
    case "openai-image":
      throw new Error(`SSE transformation not supported for ${responseApi}`);
    default:
      assertNever(responseApi);
  }
}

/**
 * OpenAI streaming chat completions start with an event that contains only the
 * metadata and role (always 'assistant') for the response.  To simulate this
 * for APIs where the first event contains actual content, we create a fake
 * initial event with no content but correct metadata.
 */
function createInitialMessage(
  event: OpenAIChatCompletionStreamEvent
): OpenAIChatCompletionStreamEvent {
  return {
    ...event,
    choices: event.choices.map((choice) => ({
      ...choice,
      delta: { role: "assistant", content: "" },
    })),
  };
}
