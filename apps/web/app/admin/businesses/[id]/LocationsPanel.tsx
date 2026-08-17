"use client";

import { useActionState, useState } from "react";
import { PlusIcon } from "lucide-react";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { useActionToast } from "../../../../lib/useActionToast";
import {
  createLocationAction,
  updateLocationAction,
  type AdminActionState,
} from "../../businesses-actions";

type Location = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
};

const initialState: AdminActionState = {};

function LocationEditForm({ businessId, location }: { businessId: string; location: Location }) {
  const boundAction = updateLocationAction.bind(null, businessId, location.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  useActionToast(state, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3">
      <Input name="name" defaultValue={location.name} required placeholder="Nombre" />
      <Input name="address" defaultValue={location.address ?? ""} placeholder="Dirección (opcional)" />
      <div className="flex gap-2">
        <Input
          name="latitude"
          type="number"
          step="any"
          defaultValue={location.latitude ?? ""}
          placeholder="Latitud (opcional)"
        />
        <Input
          name="longitude"
          type="number"
          step="any"
          defaultValue={location.longitude ?? ""}
          placeholder="Longitud (opcional)"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isActive" defaultChecked={location.isActive} />
        Activa
      </label>
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

function CreateLocationForm({ businessId }: { businessId: string }) {
  const boundAction = createLocationAction.bind(null, businessId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  useActionToast(state, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <Label className="flex items-center gap-1.5 text-sm font-medium">
        <PlusIcon className="size-3.5" />
        Nueva sucursal
      </Label>
      <Input name="name" required placeholder="Nombre" />
      <Input name="address" placeholder="Dirección (opcional)" />
      <div className="flex gap-2">
        <Input name="latitude" type="number" step="any" placeholder="Latitud (opcional)" />
        <Input name="longitude" type="number" step="any" placeholder="Longitud (opcional)" />
      </div>
      <p className="text-xs text-muted-foreground">
        Sin coordenadas, esta sucursal no participa del aviso por proximidad.
      </p>
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Creando…" : "Agregar sucursal"}
      </Button>
    </form>
  );
}

export function LocationsPanel({
  businessId,
  locations,
}: {
  businessId: string;
  locations: Location[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {locations.map((location) =>
        editingId === location.id ? (
          <LocationEditForm key={location.id} businessId={businessId} location={location} />
        ) : (
          <button
            key={location.id}
            type="button"
            onClick={() => setEditingId(location.id)}
            className="flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
          >
            <div className="flex flex-col">
              <span className="font-medium">{location.name}</span>
              {location.address ? (
                <span className="text-sm text-muted-foreground">{location.address}</span>
              ) : null}
            </div>
            <Badge variant={location.isActive ? "secondary" : "destructive"}>
              {location.isActive ? "Activa" : "Inactiva"}
            </Badge>
          </button>
        ),
      )}
      <CreateLocationForm businessId={businessId} />
    </div>
  );
}
