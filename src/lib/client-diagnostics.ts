import { z } from "zod";

const answer = z.enum(["", "sim", "nao"]).transform((value) => value === "" ? null : value === "sim");

export const clientDiagnosticsSchema = z.object({
  whatsapp: z.string().trim().max(30),
  general_notes: z.string().trim().max(2000),
  has_crc: answer,
  has_marketing_experience: answer,
  has_facebook: answer,
});