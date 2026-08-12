"use client";

import { useActionState, useId, useState } from "react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { cn } from "../../../lib/utils";
import { useActionToast } from "../../../lib/useActionToast";
import { saveRewardRuleAction, toggleRewardRuleAction } from "./actions";
import type { RewardsActionState } from "./logic";

const initialState: RewardsActionState = {};

type Rule = {
  id: string;
  name: string;
  description: string | null;
  stampsRequired: number;
  isActive: boolean;
};

// Sellos por recompensa, compartido entre alta y edición. Cuando `readOnly`
// es true (esta recompensa es la única activa — ver
// isSoleActiveRule/willBeSoleActiveRule en page.tsx), el valor SIEMPRE es
// programStampsRequired: se muestra como texto plano (nunca un <input>
// deshabilitado, que se lee como un campo roto en vez de información) y
// viaja al submit vía un input hidden — el server nunca recibe un número
// distinto al del programa para el caso de una sola recompensa. Cuando es
// editable, el tope máximo se marca en vivo (borde rojo) antes de
// guardar — el rechazo real sigue viviendo en el server
// (saveRewardRuleForSession), esto es solo la señal visual temprana.
function StampsField({
  id,
  defaultValue,
  programStampsRequired,
  readOnly,
}: {
  id: string;
  defaultValue: number;
  programStampsRequired: number;
  readOnly: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const exceeds = !readOnly && value > programStampsRequired;

  if (readOnly) {
    // Sin htmlFor: no hay ningún control enfocable al que asociar el
    // label (a diferencia del <input> del caso editable) — un <p> no es
    // un elemento "labelable".
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Sellos</Label>
        <input type="hidden" name="stampsRequired" value={programStampsRequired} />
        <p className="flex h-9 items-center gap-1 text-sm">
          {programStampsRequired}
          <span className="text-xs text-muted-foreground">(igual al ciclo del programa)</span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Sellos</Label>
      <Input
        id={id}
        name="stampsRequired"
        type="number"
        min={1}
        max={programStampsRequired}
        value={value}
        onChange={(e) => setValue(Number(e.currentTarget.value))}
        required
        aria-invalid={exceeds}
        className={cn(exceeds && "border-destructive text-destructive focus-visible:ring-destructive/50")}
      />
      {exceeds ? (
        <p className="text-xs text-destructive">Máximo {programStampsRequired} (el ciclo del programa).</p>
      ) : null}
    </div>
  );
}

export function NewRuleForm({
  programStampsRequired,
  willBeSoleActiveRule,
}: {
  programStampsRequired: number;
  willBeSoleActiveRule: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveRewardRuleAction, initialState);
  useActionToast(state, initialState);
  const stampsId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="new-rule-name">Recompensa</Label>
          <Input
            id="new-rule-name"
            name="name"
            maxLength={120}
            placeholder="Café gratis"
            required
          />
        </div>
        <StampsField
          id={stampsId}
          defaultValue={willBeSoleActiveRule ? programStampsRequired : Math.min(10, programStampsRequired)}
          programStampsRequired={programStampsRequired}
          readOnly={willBeSoleActiveRule}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-rule-description">Descripción (opcional)</Label>
        <Input
          id="new-rule-description"
          name="description"
          maxLength={500}
          placeholder="Un café americano o latte de cortesía"
        />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Agregar recompensa"}
        </Button>
      </div>
    </form>
  );
}

export function RuleRow({
  rule,
  canEdit,
  programStampsRequired,
  isSoleActiveRule,
}: {
  rule: Rule;
  canEdit: boolean;
  programStampsRequired: number;
  isSoleActiveRule: boolean;
}) {
  const [editState, editAction, editPending] = useActionState(saveRewardRuleAction, initialState);
  const [toggleState, toggleAction, togglePending] = useActionState(
    toggleRewardRuleAction,
    initialState,
  );
  useActionToast(editState, initialState);
  useActionToast(toggleState, initialState);

  if (!canEdit) {
    return (
      <div className="flex items-center justify-between gap-4 border-b py-3 last:border-0">
        <div>
          <p className="font-medium">{rule.name}</p>
          {rule.description ? (
            <p className="text-sm text-muted-foreground">{rule.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{rule.stampsRequired} sellos</span>
          <Badge variant={rule.isActive ? "default" : "secondary"}>
            {rule.isActive ? "Activa" : "Inactiva"}
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-b py-4 last:border-0">
      <form action={editAction} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[2fr_2fr_1fr_auto]">
        <input type="hidden" name="ruleId" value={rule.id} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`rule-name-${rule.id}`}>Recompensa</Label>
          <Input
            id={`rule-name-${rule.id}`}
            name="name"
            defaultValue={rule.name}
            maxLength={120}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`rule-description-${rule.id}`}>Descripción</Label>
          <Input
            id={`rule-description-${rule.id}`}
            name="description"
            defaultValue={rule.description ?? ""}
            maxLength={500}
          />
        </div>
        <StampsField
          id={`rule-stamps-${rule.id}`}
          defaultValue={rule.stampsRequired}
          programStampsRequired={programStampsRequired}
          readOnly={isSoleActiveRule}
        />
        <Button type="submit" variant="outline" size="sm" disabled={editPending}>
          {editPending ? "Guardando…" : "Guardar"}
        </Button>
      </form>
      <div className="flex items-center gap-3">
        <form action={toggleAction}>
          <input type="hidden" name="ruleId" value={rule.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={togglePending}>
            {togglePending ? "Actualizando…" : rule.isActive ? "Desactivar" : "Activar"}
          </Button>
        </form>
        <Badge variant={rule.isActive ? "default" : "secondary"}>
          {rule.isActive ? "Activa" : "Inactiva"}
        </Badge>
      </div>
    </div>
  );
}
