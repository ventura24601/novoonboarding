import { describe, expect, it } from "vitest";
import {
  assinaturaHmac,
  deveAplicar,
  extrairDocumentos,
  hmacValido,
  lerEventoConnect,
} from "./docusign";
import { receberDocusign } from "./docusign-webhook";
import { sugerirClientes } from "./docusign-match";

const evento = {
  event: "envelope-completed",
  apiVersion: "v2.1",
  generatedDateTime: "2026-11-05T13:00:00.000Z",
  data: {
    accountId: "acc",
    envelopeId: "env-1",
    envelopeSummary: {
      status: "completed",
      emailSubject: "Contrato ICOM - Clínica Sorriso Real - CNPJ 21.571.448/0001-35",
      sender: { userName: "Comercial", email: "Comercial@icom.com.br" },
      sentDateTime: "2026-11-04T10:00:00.000Z",
      completedDateTime: "2026-11-05T12:59:00.000Z",
      customFields: { textCustomFields: [{ name: "codigo_cliente", value: "C-123" }] },
      recipients: {
        signers: [
          {
            name: "Ana Paula Souza",
            email: "Ana@SorrisoReal.com.br",
            status: "completed",
            signedDateTime: "2026-11-05T12:59:00.000Z",
            tabs: {
              textTabs: [
                { tabLabel: "Telefone", value: "(11) 98888-1111" },
                { tabLabel: "CPF do responsável", value: "123.456.789-09" },
              ],
            },
          },
        ],
      },
    },
  },
};

describe("lerEventoConnect", () => {
  it("extrai envelope, signatários, campos e documentos", () => {
    const e = lerEventoConnect(evento)!;
    expect(e.envelope_id).toBe("env-1");
    expect(e.status).toBe("completed");
    expect(e.remetente_email).toBe("comercial@icom.com.br");
    expect(e.signatarios).toEqual([
      {
        nome: "Ana Paula Souza",
        email: "ana@sorrisoreal.com.br",
        status: "completed",
        assinado_em: "2026-11-05T12:59:00.000Z",
      },
    ]);
    expect(e.campos).toMatchObject({ codigo_cliente: "C-123", Telefone: "(11) 98888-1111" });
    expect(e.documentos.sort()).toEqual(["12345678909", "21571448000135"]);
    expect(e.concluido_em).toBe("2026-11-05T12:59:00.000Z");
  });
  it("usa o nome do evento quando não há resumo", () => {
    const e = lerEventoConnect({ event: "envelope-voided", data: { envelopeId: "x" } })!;
    expect(e.status).toBe("voided");
    expect(e.concluido_em).toBeNull();
  });
  it("ignora eventos que não são de envelope", () => {
    expect(lerEventoConnect({ event: "recipient-sent", data: {} })).toBeNull();
    expect(lerEventoConnect("x")).toBeNull();
  });
});

describe("extrairDocumentos", () => {
  it("não confunde telefone com CPF", () => {
    expect(extrairDocumentos({ Celular: "11988881111", Obs: "ligar 11 98888-1111" }, null)).toEqual(
      [],
    );
  });
  it("aceita CPF/CNPJ sem máscara quando o rótulo indica documento", () => {
    expect(extrairDocumentos({ CNPJ: "21571448000135", CPF: "12345678909" }, null).sort()).toEqual([
      "12345678909",
      "21571448000135",
    ]);
  });
});

describe("deveAplicar", () => {
  const novo = lerEventoConnect(evento)!;
  it("não volta concluído para enviado", () => {
    expect(
      deveAplicar(
        { status: "completed", evento_em: null },
        { ...novo, status: "sent", evento_em: null },
      ),
    ).toBe(false);
  });
  it("ignora evento mais antigo", () => {
    expect(deveAplicar({ status: "sent", evento_em: "2026-11-06T00:00:00.000Z" }, novo)).toBe(
      false,
    );
  });
  it("aplica evento novo", () => {
    expect(deveAplicar({ status: "sent", evento_em: "2026-11-04T00:00:00.000Z" }, novo)).toBe(true);
    expect(deveAplicar(null, novo)).toBe(true);
  });
});

describe("webhook DocuSign", () => {
  const corpo = JSON.stringify(evento);
  const req = async (headers: Record<string, string>, body = corpo) =>
    new Request("https://x.test/api/public/docusign", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });
  const gravados: unknown[] = [];
  const gravador = {
    buscar: async () => null,
    gravar: async (e: unknown) => {
      gravados.push(e);
    },
  };

  it("recusa sem chave configurada", async () => {
    expect((await receberDocusign(await req({}), [], gravador)).status).toBe(503);
  });
  it("recusa HMAC ausente ou errado", async () => {
    expect((await receberDocusign(await req({}), ["segredo"], gravador)).status).toBe(401);
    const errada = await assinaturaHmac("outra", new TextEncoder().encode(corpo));
    expect(
      (
        await receberDocusign(
          await req({ "X-DocuSign-Signature-1": errada }),
          ["segredo"],
          gravador,
        )
      ).status,
    ).toBe(401);
    expect(gravados).toHaveLength(0);
  });
  it("grava com HMAC válido (inclusive chave rotacionada)", async () => {
    const sig = await assinaturaHmac("nova", new TextEncoder().encode(corpo));
    const r = await receberDocusign(
      await req({ "X-DocuSign-Signature-2": sig }),
      ["antiga", "nova"],
      gravador,
    );
    expect(r.status).toBe(200);
    expect(gravados).toHaveLength(1);
    expect(
      await hmacValido(
        new TextEncoder().encode(corpo),
        new Headers({ "x-docusign-signature-1": sig }),
        ["nova"],
      ),
    ).toBe(true);
  });
  it("erro ao gravar devolve 500 para o DocuSign reenviar", async () => {
    const sig = await assinaturaHmac("k", new TextEncoder().encode(corpo));
    const r = await receberDocusign(await req({ "X-DocuSign-Signature-1": sig }), ["k"], {
      buscar: async () => null,
      gravar: async () => {
        throw new Error("db");
      },
    });
    expect(r.status).toBe(500);
  });
});

describe("sugerirClientes", () => {
  const clientes = [
    {
      id: "1",
      clinic_name: "Clínica Sorriso Real",
      legal_name: null,
      document: null,
      email: null,
      codigo_externo: null,
    },
    {
      id: "2",
      clinic_name: "OdontoMais Centro",
      legal_name: "OdontoMais Ltda",
      document: "21.571.448/0001-35",
      email: null,
      codigo_externo: null,
    },
    {
      id: "3",
      clinic_name: "Instituto Dental Norte",
      legal_name: null,
      document: null,
      email: "ana@sorrisoreal.com.br",
      codigo_externo: null,
    },
  ];
  it("ordena por evidência: documento, e-mail e nome", () => {
    const s = sugerirClientes(lerEventoConnect(evento)!, clientes);
    expect(s.map((x) => x.cliente.id)).toEqual(["2", "3", "1"]);
    expect(s[0]!.motivos).toContain("CPF/CNPJ igual");
    expect(s[2]!.motivos).toContain("Nome parecido");
  });
});
