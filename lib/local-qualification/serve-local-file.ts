import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

type ServeLocalFileOptions = {
  filePath: string | undefined;
  contentType: string;
  headOnly?: boolean;
};

type ByteRange = {
  start: number;
  end: number;
};

function parseRange(header: string, size: number): ByteRange | null {
  if (!header.startsWith("bytes=") || header.includes(",")) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) {
    return null;
  }

  const [, startText, endText] = match;

  if (!startText && !endText) {
    return null;
  }

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= size
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(requestedEnd, size - 1),
  };
}

export async function serveLocalFile(
  request: Request,
  options: ServeLocalFileOptions,
): Promise<Response> {
  const { filePath, contentType, headOnly = false } = options;

  if (!filePath) {
    return new Response("Local qualification asset is not configured.", {
      status: 503,
    });
  }

  let fileStats;

  try {
    fileStats = await stat(filePath);
  } catch {
    return new Response("Local qualification asset is unavailable.", {
      status: 404,
    });
  }

  if (!fileStats.isFile() || fileStats.size <= 0) {
    return new Response("Local qualification asset is invalid.", {
      status: 404,
    });
  }

  const size = fileStats.size;
  const rangeHeader = request.headers.get("range");

  const commonHeaders = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": contentType,
  });

  if (!rangeHeader) {
    commonHeaders.set("Content-Length", String(size));

    if (headOnly) {
      return new Response(null, {
        status: 200,
        headers: commonHeaders,
      });
    }

    const stream = createReadStream(filePath);
    const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

    return new Response(body, {
      status: 200,
      headers: commonHeaders,
    });
  }

  const range = parseRange(rangeHeader, size);

  if (!range) {
    commonHeaders.set("Content-Range", `bytes */${size}`);

    return new Response(null, {
      status: 416,
      headers: commonHeaders,
    });
  }

  const contentLength = range.end - range.start + 1;

  commonHeaders.set("Content-Length", String(contentLength));
  commonHeaders.set(
    "Content-Range",
    `bytes ${range.start}-${range.end}/${size}`,
  );

  if (headOnly) {
    return new Response(null, {
      status: 206,
      headers: commonHeaders,
    });
  }

  const stream = createReadStream(filePath, {
    start: range.start,
    end: range.end,
  });

  const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>;

  return new Response(body, {
    status: 206,
    headers: commonHeaders,
  });
}
