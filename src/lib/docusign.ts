/**
 * DocuSign Connect (formato JSON / SIM): verificação HMAC e leitura do envelope.
 * Funções puras, usadas pelo webhook público (src/routes/api/public/docusign.ts) e pelos testes.
 */

export type Signatario = {
  nome: string | null;
  email: string | null;
  status: string | null;
  assinado_em: string | null;
};

export type EnvelopeDocusign = {
  envelope_id: string;
  status: string;
  assunto: string | null;
  remetente_email: string | null;
  signatarios: Signatario[];
  campos: Record<string, string>;
  documentos: string[];
  enviado_em: string | null;
  concluido_em: string | null;
  evento_em: string | null;
};

const enc = new TextEncoder();

function base64(bytes: ArrayBuffer) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Assinatura HMAC-SHA256 em base64 do corpo bruto, como o DocuSign envia em X-DocuSign-Signature-N. */
export async function assinaturaHmac(chave: string, corpo: Uint8Array) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(chave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64(await crypto.subtle.sign("HMAC", key, new Uint8Array(corpo)));
}

/** Aceita se qualquer cabeçalho X-DocuSign-Signature-N bater com qualquer chave configurada (permite rotação). */
export async function hmacValido(corpo: Uint8Array, headers: Headers, chaves: string[]) {
  const recebidas: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const h = headers.get(`x-docusign-signature-${i}`);
    if (h) recebidas.push(h.trim());
  }
  if (!recebidas.length || !chaves.length) return false;
  for (const chave of chaves) {
    const esperada = await assinaturaHmac(chave, corpo);
    if (recebidas.some((r) => iguais(r, esperada))) return true;
  }
  return false;
}

const STATUS_POR_EVENTO: Record<string, string> = {
  "envelope-sent": "sent",
  "envelope-delivered": "delivered",
  "envelope-completed": "completed",
  "envelope-declined": "declined",
  "envelope-voided": "voided",
  "envelope-resent": "sent",
  "envelope-corrected": "sent",
};

const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CPF_FORMATADO = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const so = (t: string) => t.replace(/\D/g, "");

/** CPF/CNPJ (só dígitos) a partir dos campos e do assunto, sem confundir com telefone. */
export function extrairDocumentos(campos: Record<string, string>, assunto: string | null) {
  const out = new Set<string>();
  const varrer = (t: string) => {
    for (const m of t.matchAll(CNPJ)) if (so(m[0]).length === 14) out.add(so(m[0]));
    for (const m of t.matchAll(CPF_FORMATADO)) out.add(so(m[0]));
  };
  for (const [rotulo, valor] of Object.entries(campos)) {
    const d = so(valor);
    if (/cnpj|cpf|documento/i.test(rotulo) && (d.length === 11 || d.length === 14)) out.add(d);
    else varrer(valor);
  }
  if (assunto) varrer(assunto);
  return [...out];
}

type Chave =
  | "data"
  | "envelopeSummary"
  | "envelopeId"
  | "event"
  | "status"
  | "customFields"
  | "textCustomFields"
  | "listCustomFields"
  | "name"
  | "value"
  | "recipients"
  | "signers"
  | "email"
  | "signedDateTime"
  | "tabs"
  | "tabLabel"
  | "emailSubject"
  | "sender"
  | "sentDateTime"
  | "completedDateTime"
  | "generatedDateTime";
type Json = Partial<Record<Chave, unknown>>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;
const data = (v: unknown): string | null => {
  const s = str(v);
  if (!s || s.startsWith("0001-")) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Lê o evento do Connect. Retorna null se não for um evento de envelope reconhecível. */
export function lerEventoConnect(payload: unknown): EnvelopeDocusign | null {
  const p = obj(payload);
  const d = obj(p.data);
  const resumo = obj(d.envelopeSummary);
  const envelopeId = str(d.envelopeId) ?? str(resumo.envelopeId);
  const evento = str(p.event);
  if (!envelopeId || !evento?.startsWith("envelope-")) return null;
  const status = (
    str(resumo.status) ??
    STATUS_POR_EVENTO[evento] ??
    evento.replace("envelope-", "")
  ).toLowerCase();

  const campos: Record<string, string> = {};
  const cf = obj(resumo.customFields);
  for (const f of [...arr(cf.textCustomFields), ...arr(cf.listCustomFields)]) {
    const n = str(obj(f).name),
      v = str(obj(f).value);
    if (n && v) campos[n] = v;
  }

  const signatarios: Signatario[] = [];
  for (const s of arr(obj(resumo.recipients).signers)) {
    const r = obj(s);
    signatarios.push({
      nome: str(r.name),
      email: str(r.email)?.toLowerCase() ?? null,
      status: str(r.status),
      assinado_em: data(r.signedDateTime),
    });
    const tabs = obj(r.tabs);
    for (const lista of Object.values(tabs)) {
      for (const t of arr(lista)) {
        const n = str(obj(t).tabLabel),
          v = str(obj(t).value);
        if (n && v && !(n in campos)) campos[n] = v.slice(0, 500);
      }
    }
  }

  const assunto = str(resumo.emailSubject);
  return {
    envelope_id: envelopeId,
    status,
    assunto,
    remetente_email: str(obj(resumo.sender).email)?.toLowerCase() ?? null,
    signatarios,
    campos,
    documentos: extrairDocumentos(campos, assunto),
    enviado_em: data(resumo.sentDateTime),
    concluido_em:
      status === "completed" ? (data(resumo.completedDateTime) ?? data(p.generatedDateTime)) : null,
    evento_em: data(p.generatedDateTime),
  };
}

const ORDEM_STATUS: Record<string, number> = {
  created: 0,
  sent: 1,
  delivered: 2,
  completed: 3,
  declined: 3,
  voided: 3,
};

/** Evento atrasado/repetido não deve voltar um envelope concluído para "enviado". */
export function deveAplicar(
  atual: { status: string; evento_em: string | null } | null,
  novo: EnvelopeDocusign,
) {
  if (!atual) return true;
  if (atual.evento_em && novo.evento_em && novo.evento_em < atual.evento_em) return false;
  return (ORDEM_STATUS[novo.status] ?? 1) >= (ORDEM_STATUS[atual.status] ?? 1);
}

export const STATUS_ENVELOPE: Record<string, string> = {
  sent: "Enviado",
  delivered: "Visualizado",
  completed: "Assinado",
  declined: "Recusado",
  voided: "Cancelado",
};
