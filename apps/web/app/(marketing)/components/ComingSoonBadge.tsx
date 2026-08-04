import { Badge } from "../../../components/ui/badge";

// Marca visual única para toda función no construida todavía (ver
// wallet-bi-plans.md: Intelligence y cupones NO deben venderse por escrito
// como si entregaran hoy). Un solo componente, reusado en toda la landing,
// para que "Próximamente" nunca se escriba distinto en dos lugares.
export function ComingSoonBadge() {
  return (
    <Badge variant="secondary" className="align-middle">
      Próximamente
    </Badge>
  );
}
