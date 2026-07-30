"use client";

import { useActionState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
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
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="program-active"
          name="isActive"
          type="checkbox"
          defaultChecked={program?.isActive ?? true}
          className="size-4 accent-primary"
        />
        <Label htmlFor="program-active">Programa activo</Label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : program ? "Guardar cambios" : "Crear programa"}
        </Button>
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="text-sm text-muted-foreground">{state.success}</p>
        ) : null}
      </div>
    </form>
  );
}
