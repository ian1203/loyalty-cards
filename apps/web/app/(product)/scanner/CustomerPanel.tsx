"use client";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { StampRow } from "../../../components/StampRow";
import type { ScannerCustomerView } from "./logic";

type Props = {
  view: ScannerCustomerView;
  onStamp: () => void;
  onRedeem: (ruleId: string) => void;
  onClear: () => void;
  pending: boolean;
};

// La UI solo REFLEJA lo que el server decidió (regla de la skill): los
// botones se deshabilitan mientras hay una operación en curso, pero la
// decisión real (cooldown, sellos suficientes, negocio/empleado activos,
// sucursal válida) siempre la toma scanner/logic.ts — deshabilitar acá es
// cortesía, no seguridad.
export function CustomerPanel({ view, onStamp, onRedeem, onClear, pending }: Props) {
  const { customer, program, progress, rewardOptions } = view;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{customer.fullName ?? "(sin nombre)"}</CardTitle>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Otro cliente
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="font-medium">{program.name}</p>
            <div className="flex items-center gap-2">
              {!program.isActive ? <Badge variant="secondary">Pausado</Badge> : null}
              <span className="text-sm text-muted-foreground">
                {progress.currentStamps} de {progress.stampsRequired} sellos
              </span>
            </div>
          </div>
          <StampRow current={progress.currentStamps} required={progress.stampsRequired} />
        </div>

        <Button type="button" onClick={onStamp} disabled={pending || !program.isActive}>
          {pending ? "Procesando…" : "Registrar sello"}
        </Button>

        {rewardOptions.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">Recompensas</p>
            {rewardOptions.map((option) => (
              <div
                key={option.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{option.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {option.stampsRequired} sellos
                  </p>
                </div>
                <Button
                  type="button"
                  variant={option.available ? "default" : "outline"}
                  size="sm"
                  disabled={pending || !option.available}
                  onClick={() => onRedeem(option.id)}
                >
                  Canjear
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
