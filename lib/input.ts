/** Limit JSON before parsing, including bodies without a trustworthy Content-Length. */
export async function readJson(
  req: Request,
  maxBytes = 65536,
): Promise<unknown> {
  if (!req.body) throw new Error("JSON body required.");
  const reader = req.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Body too large.");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}
