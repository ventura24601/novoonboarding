import type { LucideIcon } from "lucide-react";
import { Check, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { statusToken } from "@/lib/status";

/** Badge de status (11px, peso 700, raio 4px) com as cores de src/lib/status.ts. */
export function StatusBadge({ status, label, className }: { status: string | null | undefined; label?: string; className?: string }) {
  const t = statusToken(status);
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold leading-4", t.strike && "line-through", className)}
      style={{ backgroundColor: t.bg, color: t.text }}
    >
      {t.icon === "lock" && <Lock className="h-3 w-3" strokeWidth={2.5} />}
      {t.icon === "check" && <Check className="h-3 w-3" strokeWidth={3} />}
      {label ?? t.label}
    </span>
  );
}

/** Badge neutro com cor livre (produto, papel, opção de campo). */
export function ColorBadge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-bold leading-4"
      style={{ backgroundColor: `${color}1A`, color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

/** Card de KPI: borda esquerda colorida, título em caixa alta, número grande, ícone em círculo. Clicável. */
export function KpiCard({
  title, value, icon: Icon, color, selected, onClick, hint,
}: {
  title: string; value: ReactNode; icon: LucideIcon; color: string; selected?: boolean; onClick?: () => void; hint?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      title={hint}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg border border-l-4 bg-card px-4 py-3.5 text-left shadow-card transition",
        onClick && "cursor-pointer hover:shadow-md",
        selected && "ring-2 ring-primary ring-offset-1",
      )}
      style={{ borderLeftColor: color }}
    >
      <div className="min-w-0">
        <div className="filter-label truncate">{title}</div>
        <div className="mt-1 text-[28px] font-bold leading-none tabular-nums text-[#1F2937]">{value}</div>
      </div>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9]" style={{ color }}>
        <Icon className="h-5 w-5" />
      </span>
    </Comp>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 py-16 text-center shadow-card">
      <span className="relative mb-5 flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-accent" />
        <span className="absolute inset-2 rounded-full bg-[#E9DDFF]" />
        <Icon className="relative h-7 w-7 text-primary" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border bg-card shadow-card", className)}>{children}</div>;
}

export function FilterLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return <label htmlFor={htmlFor} className="filter-label mb-1.5 block">{children}</label>;
}

/** Toast padrão das ações de etapa, sempre com "Desfazer". */
export function toastComDesfazer(mensagem: string, desfazer: () => void | Promise<void>) {
  toast.success(mensagem, {
    duration: 6000,
    action: { label: "Desfazer", onClick: () => void desfazer() },
  });
}
