import {
  ClientProtocolId,
  FrameActionPayload,
  FrameMessageReturnType,
  HubHttpUrlOptions,
  getFrameMessage,
} from "..";
import {
  InvalidFrameActionPayloadError,
  RequestBodyNotJSONError,
} from "../core/errors";
import { FramesMiddleware, JsonValue } from "../core/types";

function isValidFrameActionPayload(
  value: unknown
): value is FrameActionPayload {
  return (
    typeof value === "object" &&
    !!value &&
    "trustedData" in value &&
    "untrustedData" in value
  );
}

async function decodeFrameActionPayloadFromRequest(
  request: Request
): Promise<FrameActionPayload | undefined> {
  try {
    // use clone just in case someone wants to read body somewhere along the way
    const body = await request
      .clone()
      .json()
      .catch(() => {
        throw new RequestBodyNotJSONError();
      });

    if (!isValidFrameActionPayload(body)) {
      throw new InvalidFrameActionPayloadError();
    }

    return body;
  } catch (e) {
    if (
      e instanceof RequestBodyNotJSONError ||
      e instanceof InvalidFrameActionPayloadError
    ) {
      return undefined;
    }

    console.error(e);

    return undefined;
  }
}

type FrameMessage = Omit<
  FrameMessageReturnType<{ fetchHubContext: true }>,
  "message"
> & { state?: JsonValue };

type FramesMessageContext = {
  message?: FrameMessage;
  clientProtocol?: ClientProtocolId;
};

export function farcasterHubContext(
  options?: HubHttpUrlOptions
): FramesMiddleware<any, FramesMessageContext> {
  return async (context, next) => {
    // frame message is available only if the request is a POST request
    if (context.request.method !== "POST") {
      return next();
    }

    // body must be a JSON object
    const payload = await decodeFrameActionPayloadFromRequest(context.request);

    if (!payload) {
      return next();
    }

    const message = await getFrameMessage(payload, {
      ...options,
      fetchHubContext: true,
    });

    return next({
      message,
      clientProtocol: {
        id: "farcaster",
        version: "vNext", // TODO: Pass version in getFrameMessage
      },
    });
  };
}
