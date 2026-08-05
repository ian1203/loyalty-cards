"use client";

import { MapPinIcon } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";

type Location = { id: string; name: string };

type Props = {
  locations: Location[];
  onSelect: (locationId: string) => void;
};

// El empleado SELECCIONA su sucursal al iniciar operación — el server la
// vuelve a validar contra la DB en cada sello/canje (nunca confía en esta
// elección de UI ni en el location_id del JWT, que puede estar
// desactualizado). Ver requireOperationContext en scanner/logic.ts.
export function LocationPicker({ locations, onSelect }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Selecciona tu sucursal</CardTitle>
        <CardDescription>Cada sello y canje queda registrado con esta sucursal.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {locations.map((location) => (
          <Button
            key={location.id}
            type="button"
            variant="outline"
            className="justify-start"
            onClick={() => onSelect(location.id)}
          >
            <MapPinIcon />
            {location.name}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
