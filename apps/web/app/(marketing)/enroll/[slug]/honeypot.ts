// Archivo dedicado, sin ninguna otra importación — EnrollForm.tsx ("use
// client") necesita este nombre de campo, y logic.ts (server, importa
// @loyalty/db/enroll → pg, dependencias Node-only como fs/net/dns) no se
// puede importar de valor desde un componente cliente sin que webpack
// intente meter todo ese grafo al bundle del navegador (bug real: build
// de Vercel falló con "Module not found: Can't resolve 'fs'/'net'/'dns'"
// al importar HONEYPOT_FIELD directo desde logic.ts). Import type-only
// SÍ se borra en compilación (por eso EnrollActionState nunca causó esto);
// un import de VALOR no.
export const HONEYPOT_FIELD = "company";
