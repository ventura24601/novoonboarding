import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useClients, useSellers } from "@/lib/session";
import { commission, formatBRL } from "@/lib/crm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/comissoes")({
  head: () => ({ meta: [{ title: "Comissões — Icom" }] }),
  component: Commissions,
});

function Commissions() {
  const { data: clients = [] } = useClients();
  const { data: sellers = [] } = useSellers();
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [rate, setRate] = useState("5");
  const [onlySigned, setOnlySigned] = useState(true);

  const rows = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const inMonth = clients.filter((c) => {
      const d = new Date(onlySigned ? c.contract_signed_at ?? "" : c.created_at);
      return (!onlySigned || c.contract_signed) && d.getFullYear() === y && d.getMonth() + 1 === m;
    });
    const map = new Map<string, { count: number; total: number }>();
    for (const c of inMonth) {
      const k = c.seller_id ?? "none";
      const cur = map.get(k) ?? { count: 0, total: 0 };
      map.set(k, { count: cur.count + 1, total: cur.total + c.value });
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, name: sellers.find((s) => s.id === id)?.full_name || "Sem vendedor", ...v }))
      .sort((a, b) => b.total - a.total);
  }, [clients, sellers, month, onlySigned]);

  const r = Number(rate.replace(",", ".")) || 0;
  const total = rows.reduce((s, x) => s + x.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Comissões</h1>
        <p className="text-muted-foreground">Vendas por vendedor no período.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4 rounded-xl bg-card p-4 shadow-card">
        <div className="space-y-2"><Label htmlFor="m">Mês</Label><Input id="m" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="r">Comissão (%)</Label><Input id="r" className="w-28" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Checkbox checked={onlySigned} onCheckedChange={(v) => setOnlySigned(v === true)} /> Somente contratos assinados
        </label>
      </div>
      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Vendas</TableHead>
              <TableHead className="text-right">Total vendido</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((x) => (
              <TableRow key={x.id}>
                <TableCell className="font-medium">{x.name}</TableCell>
                <TableCell className="text-right tabular-nums">{x.count}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBRL(x.total)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums text-primary">{formatBRL(commission(x.total, r))}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Nenhuma venda no período.</TableCell></TableRow>
            )}
            {rows.length > 0 && (
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{rows.reduce((s, x) => s + x.count, 0)}</TableCell>
                <TableCell className="text-right">{formatBRL(total)}</TableCell>
                <TableCell className="text-right">{formatBRL(commission(total, r))}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
