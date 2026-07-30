// Compartido entre /customers/[id] y /scanner: misma barra de progreso de
// sellos, un solo lugar si cambia el diseño.
export function StampProgressBar({
  current,
  required,
}: {
  current: number;
  required: number;
}) {
  const progress = Math.min(100, Math.round((current / required) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
    </div>
  );
}
