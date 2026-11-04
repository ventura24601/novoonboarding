import { createFileRoute } from "@tanstack/react-router";
import { receiveContractExample } from "@/lib/contract-webhook";

export const Route = createFileRoute("/api/public/contratos")({
  server: {
    handlers: {
      POST: ({ request }) => receiveContractExample(request),
    },
  },
});