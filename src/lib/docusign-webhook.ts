import { deveAplicar, hmacValido, lerEventoConnect } from "./docusign";

const LIMITE = 2 * 1024 * 1024;

async function lerCorpo(request: Request): Promise<Uint8Array | "grande" | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    tamanho += value.byteLength;
    if (tamanho > LIMITE) {
      await reader.cancel();
      return "grande";
    }
    partes.push(value);
  }
  const out = new Uint8Array(tamanho);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

type Gravador = {
  buscar: (envelopeId: string) => Promise<{ status: string; evento_em: string | null } | null>;
  gravar: (dados: ReturnType<typeof lerEventoConnect> & object) => Promise<void>;
};

/**
 * Webhook do DocuSign Connect. Só grava com HMAC válido (DOCUSIGN_CONNECT_HMAC_KEY, várias chaves
 * separadas por vírgula). Sem chave configurada, recusa tudo. Erro de gravação → 500 (o DocuSign reenvia).
 */
export async function receberDocusign(
  request: Request,
  chaves: string[],
  gravador: Gravador,
): Promise<Response> {
  if (!chaves.length)
    return Response.json({ error: "Integração DocuSign não configurada." }, { status: 503 });
  const corpo = await lerCorpo(request);
  if (corpo === "grande") return Response.json({ error: "Corpo excede 2 MiB." }, { status: 413 });
  if (!corpo) return Response.json({ error: "Corpo obrigatório." }, { status: 400 });
  if (!(await hmacValido(corpo, request.headers, chaves))) {
    return Response.json({ error: "Assinatura HMAC inválida." }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(corpo));
  } catch {
    return Response.json(
      { error: "JSON inválido. Configure o Connect no formato JSON." },
      { status: 400 },
    );
  }
  const env = lerEventoConnect(payload);
  if (!env) return Response.json({ received: true, ignored: true });
  try {
    const atual = await gravador.buscar(env.envelope_id);
    if (!deveAplicar(atual, env)) return Response.json({ received: true, stale: true });
    await gravador.gravar(env);
    return Response.json({ received: true });
  } catch (e) {
    console.error(
      "[docusign] falha ao gravar envelope",
      env.envelope_id,
      e instanceof Error ? e.message : e,
    );
    return Response.json({ error: "Falha ao gravar." }, { status: 500 });
  }
}

export function chavesConfiguradas() {
  return (process.env["DOCUSIGN_CONNECT_HMAC_KEY"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
