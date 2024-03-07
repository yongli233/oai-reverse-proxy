import pino from "pino";
import { Transform, TransformOptions } from "stream";
import { Message } from "@smithy/eventstream-codec";
import { APIFormat } from "../../../../shared/key-management";
<<<<<<< HEAD
import { makeCompletionSSE } from "../../../../shared/streaming";
import { RetryableError } from "../index";
=======
import { RetryableError } from "../index";
import { buildSpoofedSSE } from "../error-generator";
>>>>>>> upstream/main

type SSEStreamAdapterOptions = TransformOptions & {
  contentType?: string;
  api: APIFormat;
  logger: pino.Logger;
};

/**
 * Receives a stream of events in a variety of formats and transforms them into
 * Server-Sent Events.
 *
 * This is an object-mode stream, so it expects to receive objects and will emit
 * strings.
 */
export class SSEStreamAdapter extends Transform {
  private readonly isAwsStream;
  private readonly isGoogleStream;
<<<<<<< HEAD
=======
  private api: APIFormat;
>>>>>>> upstream/main
  private partialMessage = "";
  private textDecoder = new TextDecoder("utf8");
  private log: pino.Logger;

  constructor(options: SSEStreamAdapterOptions) {
    super({ ...options, objectMode: true });
    this.isAwsStream =
      options?.contentType === "application/vnd.amazon.eventstream";
    this.isGoogleStream = options?.api === "google-ai";
<<<<<<< HEAD
=======
    this.api = options.api;
>>>>>>> upstream/main
    this.log = options.logger.child({ module: "sse-stream-adapter" });
  }

  protected processAwsMessage(message: Message): string | null {
    // Per amazon, headers and body are always present. headers is an object,
    // body is a Uint8Array, potentially zero-length.
    const { headers, body } = message;
    const eventType = headers[":event-type"]?.value;
    const messageType = headers[":message-type"]?.value;
    const contentType = headers[":content-type"]?.value;
    const exceptionType = headers[":exception-type"]?.value;
    const errorCode = headers[":error-code"]?.value;
    const bodyStr = this.textDecoder.decode(body);

    switch (messageType) {
      case "event":
        if (contentType === "application/json" && eventType === "chunk") {
          const { bytes } = JSON.parse(bodyStr);
          const event = Buffer.from(bytes, "base64").toString("utf8");
<<<<<<< HEAD
          return ["event: completion", `data: ${event}`].join(`\n`);
=======
          const eventObj = JSON.parse(event);

          if ("completion" in eventObj) {
            return ["event: completion", `data: ${event}`].join(`\n`);
          } else {
            return [`event: ${eventObj.type}`, `data: ${event}`].join(`\n`);
          }
>>>>>>> upstream/main
        }
      // Intentional fallthrough, as non-JSON events may as well be errors
      // noinspection FallThroughInSwitchStatementJS
      case "exception":
      case "error":
        const type = String(
          exceptionType || errorCode || "UnknownError"
        ).toLowerCase();
        switch (type) {
          case "throttlingexception":
            this.log.warn(
              "AWS request throttled after streaming has already started; retrying"
            );
            throw new RetryableError("AWS request throttled mid-stream");
          default:
            this.log.error({ message, type }, "Received bad AWS stream event");
<<<<<<< HEAD
            return makeCompletionSSE({
              format: "anthropic",
              title: "Proxy stream error",
              message:
                "The proxy received an unrecognized error from AWS while streaming.",
              obj: message,
              reqId: "proxy-sse-adapter-message",
              model: "",
            });
=======
            let text;
            try {
              const { bytes } = JSON.parse(bodyStr);
              text = Buffer.from(bytes, "base64").toString("utf8");
            } catch (error) {
              text = bodyStr;
            }
            const error: any = new Error(`Got mysterious error chunk: ${type}`);
            error.lastEvent = text;
            this.emit("error", error);
            return null;
>>>>>>> upstream/main
        }
      default:
        // Amazon says this can't ever happen...
        this.log.error({ message }, "Received very bad AWS stream event");
        return null;
    }
  }

  /** Processes an incoming array element from the Google AI JSON stream. */
  protected processGoogleObject(data: any): string | null {
    // Sometimes data has fields key and value, sometimes it's just the
    // candidates array.
    const candidates = data.value?.candidates ?? data.candidates ?? [{}];
    try {
      const hasParts = candidates[0].content?.parts?.length > 0;
      if (hasParts) {
        return `data: ${JSON.stringify(data)}`;
      } else {
        this.log.error({ event: data }, "Received bad Google AI event");
<<<<<<< HEAD
        return `data: ${makeCompletionSSE({
=======
        return `data: ${buildSpoofedSSE({
>>>>>>> upstream/main
          format: "google-ai",
          title: "Proxy stream error",
          message:
            "The proxy received malformed or unexpected data from Google AI while streaming.",
          obj: data,
          reqId: "proxy-sse-adapter-message",
          model: "",
        })}`;
      }
    } catch (error) {
      error.lastEvent = data;
      this.emit("error", error);
    }
    return null;
  }

  _transform(data: any, _enc: string, callback: (err?: Error | null) => void) {
    try {
      if (this.isAwsStream) {
        // `data` is a Message object
        const message = this.processAwsMessage(data);
        if (message) this.push(message + "\n\n");
      } else if (this.isGoogleStream) {
        // `data` is an element from the Google AI JSON stream
        const message = this.processGoogleObject(data);
        if (message) this.push(message + "\n\n");
      } else {
        // `data` is a string, but possibly only a partial message
        const fullMessages = (this.partialMessage + data).split(
          /\r\r|\n\n|\r\n\r\n/
        );
        this.partialMessage = fullMessages.pop() || "";

        for (const message of fullMessages) {
          // Mixing line endings will break some clients and our request queue
          // will have already sent \n for heartbeats, so we need to normalize
          // to \n.
          this.push(message.replace(/\r\n?/g, "\n") + "\n\n");
        }
      }
      callback();
    } catch (error) {
<<<<<<< HEAD
      error.lastEvent = data?.toString();
      this.emit("error", error);
=======
      error.lastEvent = data?.toString() ?? "[SSEStreamAdapter] no data";
>>>>>>> upstream/main
      callback(error);
    }
  }

  _flush(callback: (err?: Error | null) => void) {
    callback();
  }
}
