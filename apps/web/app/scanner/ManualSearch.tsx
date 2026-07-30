"use client";

import { useState, useTransition } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { searchCustomersForScannerAction, type ScannerSearchRow } from "./actions";

type Props = {
  onSelect: (customerId: string) => void;
  disabled?: boolean;
};

// Fallback cuando no hay cámara ni lector a mano: búsqueda manual
// tenant-scoped (reutiliza exactamente searchCustomers de /customers, vía
// la action). Elegir un resultado hace el mismo lookup que un escaneo.
export function ManualSearch({ onSelect, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ScannerSearchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await searchCustomersForScannerAction(query);
      if ("error" in result) {
        setError(result.error);
        setRows([]);
        return;
      }
      setRows(result.rows);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Buscar por nombre, teléfono o email…"
          disabled={disabled}
        />
        <Button type="submit" variant="outline" disabled={disabled || pending}>
          {pending ? "Buscando…" : "Buscar"}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-md border">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(row.id)}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="font-medium">{row.fullName ?? "(sin nombre)"}</span>
                <span className="text-muted-foreground">
                  {row.phone ?? row.email ?? "sin contacto"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
