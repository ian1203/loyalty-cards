// Tipo nominal sin costo en runtime: distingue valores que "parecen" el tipo
// base (p.ej. string) pero que solo se deben poder construir en un punto
// controlado del código (ver VerifiedBusinessId en packages/db). El brand no
// es una barrera de seguridad en sí mismo — la barrera real es la
// verificación que ocurre antes del cast — pero convierte "pasar un valor
// que no vino de esa verificación" en un error de compilación en vez de un
// descuido silencioso.
export type Brand<T, B extends string> = T & { readonly __brand: B };
