import { z } from "zod";

const exampleSchema = z.union([
  z.record(z.unknown()).refine((value) => Object.keys(value).length > 0),
  z.array(z.record(z.unknown()).refine((value) => Object.keys(value).length > 0)).min(1).max(10),
]);

/** Public diagnostic receiver only: never persists payloads or changes clients. */
export async function receiveContractExample(request: Request): Promise<Response> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Envie application/json." }, { status: 415 });
  }
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Body obrigatório." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) {
      await reader.cancel();
      return Response.json({ error: "Body excede 64 KiB." }, { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const result = exampleSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!result.success) return Response.json({ error: "Envie um objeto ou uma lista de até 10 objetos." }, { status: 400 });
    return Response.json({
      received: true,
      mode: "test",
      clients_updated: false,
      payload_stored: false,
    });
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
}