import { CheckIcon, ChevronDownIcon, ListChecksIcon, XIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { COMPARISON_FOOTNOTE, COMPARISON_MATRIX } from "../../../lib/marketing/content";

// Ícono en vez de "Sí"/"No" (estándar en tablas de pricing, más escaneable).
// "No" en destructive/rojo a propósito (pedido explícito): resalta más a
// la vista que el check verde, para que la diferencia entre planes se
// note de un vistazo.
function BooleanCell({ value }: { value: string }) {
  const isYes = value === "Sí";
  return (
    <span className="inline-flex items-center">
      {isYes ? (
        <CheckIcon className="size-4 text-success" aria-hidden="true" />
      ) : (
        <XIcon className="size-4 text-destructive" aria-hidden="true" />
      )}
      <span className="sr-only">{value}</span>
    </span>
  );
}

// <details> nativo en vez de un Accordion de shadcn: es "expandible" con
// cero JS y cero dependencia nueva. NUNCA abierto por default (feedback de
// marketing: la tabla completa abierta de entrada abruma la sección de
// precios) — lo que sí cambió es que el trigger ahora es imposible de
// pasar de largo: borde + fondo con el acento de marca, ícono de lista
// (no una flechita sola) y el texto "Ver todas las diferencias" a la
// derecha, además del label principal a la izquierda.
export function ComparisonMatrix() {
  return (
    <details className="group overflow-hidden rounded-lg border-2 border-primary/25 bg-primary/5 open:bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 marker:content-none hover:bg-primary/10 group-open:hover:bg-transparent">
        <span className="inline-flex items-center gap-2.5 font-semibold text-primary">
          <ListChecksIcon className="size-5 shrink-0" aria-hidden="true" />
          Ver comparación completa de planes
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary">
          <span className="hidden sm:inline">Ver todas las diferencias</span>
          <ChevronDownIcon className="size-5 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="border-t px-5 pb-5 pt-2">
        <Table>
          <TableCaption className="text-left">{COMPARISON_FOOTNOTE}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Característica</TableHead>
              <TableHead>Básico</TableHead>
              <TableHead>Negocio</TableHead>
              <TableHead>Intelligence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {COMPARISON_MATRIX.map((row, i) => {
              // Separador visual entre el grupo de valores (precio,
              // cantidades) y el grupo de características Sí/No — un
              // borde más marcado en la primera fila del segundo grupo,
              // sin agregar una fila/elemento extra al DOM.
              const isFirstBoolean = row.kind === "boolean" && COMPARISON_MATRIX[i - 1]?.kind !== "boolean";
              return (
                <TableRow key={row.feature} className={isFirstBoolean ? "border-t-2 border-t-border" : undefined}>
                  <TableCell className="font-medium">{row.feature}</TableCell>
                  <TableCell>{row.kind === "boolean" ? <BooleanCell value={row.basico} /> : row.basico}</TableCell>
                  <TableCell>{row.kind === "boolean" ? <BooleanCell value={row.negocio} /> : row.negocio}</TableCell>
                  <TableCell>
                    {row.kind === "boolean" ? <BooleanCell value={row.intelligence} /> : row.intelligence}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}
