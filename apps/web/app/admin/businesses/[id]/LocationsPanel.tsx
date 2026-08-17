"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "../../../../components/ui/alert";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Checkbox } from "../../../../components/ui/checkbox";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
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

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-md border p-3">
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
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

function CreateLocationForm({ businessId }: { businessId: string }) {
  const boundAction = createLocationAction.bind(null, businessId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-md border border-dashed p-3">
      <Label>Nueva sucursal</Label>
      <Input name="name" required placeholder="Nombre" />
      <Input name="address" placeholder="Dirección (opcional)" />
      <div className="flex gap-2">
        <Input name="latitude" type="number" step="any" placeholder="Latitud (opcional)" />
        <Input name="longitude" type="number" step="any" placeholder="Longitud (opcional)" />
      </div>
      <p className="text-xs text-muted-foreground">
        Sin coordenadas, esta sucursal no participa del aviso por proximidad.
      </p>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Creando…" : "Agregar sucursal"}
      </Button>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
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
            className="flex items-center justify-between gap-3 rounded-md border p-3 text-left hover:bg-muted/40"
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
