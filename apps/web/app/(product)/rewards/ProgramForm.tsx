"use client";

import { useActionState } from "react";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { useActionToast } from "../../../lib/useActionToast";
import { saveProgramAction } from "./actions";
import type { RewardsActionState } from "./logic";

const initialState: RewardsActionState = {};

type Props = {
  program: {
    name: string;
    stampsRequired: number;
    cooldownSeconds: number;
    isActive: boolean;
  } | null;
};

export function ProgramForm({ program }: Props) {
  const [state, formAction, pending] = useActionState(saveProgramAction, initialState);
  useActionToast(state, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="program-name">Nombre del programa</Label>
        <Input
          id="program-name"
          name="name"
          defaultValue={program?.name ?? ""}
          maxLength={120}
          placeholder="Tarjeta de sellos"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="program-stamps">Sellos para completar</Label>
          <Input
            id="program-stamps"
            name="stampsRequired"
            type="number"
            min={1}
            max={100}
            defaultValue={program?.stampsRequired ?? 10}
            required
          />
          <p className="text-xs text-muted-foreground">Cuántas visitas necesita un cliente para su recompensa.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="program-cooldown">Cooldown entre sellos (minutos)</Label>
          <Input
            id="program-cooldown"
            name="cooldownMinutes"
            type="number"
            min={0}
            max={1440}
            defaultValue={program ? Math.round(program.cooldownSeconds / 60) : 0}
            required
          />
          <p className="text-xs text-muted-foreground">Tiempo mínimo entre dos sellos del mismo cliente.</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="program-active" name="isActive" defaultChecked={program?.isActive ?? true} />
        <Label htmlFor="program-active">Programa activo</Label>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : program ? "Guardar cambios" : "Crear programa"}
        </Button>
      </div>
    </form>
  );
}
