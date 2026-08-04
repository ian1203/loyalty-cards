import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { ComingSoonBadge } from "./ComingSoonBadge";
import { COMPARISON_FOOTNOTE, COMPARISON_MATRIX } from "../../../lib/marketing/content";

// <details> nativo en vez de un Accordion de shadcn: es "expandible" con
// cero JS y cero dependencia nueva (shadcn Accordion tira @radix-ui/react-accordion,
// no hace falta para un solo bloque colapsable).
export function ComparisonMatrix() {
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="cursor-pointer list-none px-5 py-4 font-medium marker:content-none">
        <span className="inline-flex items-center gap-2">
          Ver comparación completa de planes
          <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true">
            ▾
          </span>
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
            {COMPARISON_MATRIX.map((row) => (
              <TableRow key={row.feature}>
                <TableCell className="font-medium">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {row.feature}
                    {row.comingSoon ? <ComingSoonBadge /> : null}
                  </span>
                </TableCell>
                <TableCell>{row.basico}</TableCell>
                <TableCell>{row.negocio}</TableCell>
                <TableCell>{row.intelligence}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}
