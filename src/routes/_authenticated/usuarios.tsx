import { createFileRoute, redirect } from "@tanstack/react-router";

// Rota antiga: Usuários agora fica em Configurações.
export const Route = createFileRoute("/_authenticated/usuarios")({
  beforeLoad: () => { throw redirect({ to: "/configuracoes" }); },
});
