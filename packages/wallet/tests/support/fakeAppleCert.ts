import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type FakeAppleCertBundle = {
  passCertPem: string;
  passKeyPem: string;
  wwdrCertPem: string;
};

// Genera un certificado autofirmado LOCAL vía el binario openssl — SOLO
// para tests (ver apple/signer.ts: la implementación REAL de la firma
// nunca invoca openssl, usa node-forge puro; este helper es la única
// pieza de todo el paquete que shell-ea a un binario externo, y nunca
// corre en producción). El .pkpass resultante no sería confiable para un
// iPhone real, pero ejercita byte a byte el mismo pipeline PKCS#7 que
// correría con el certificado pagado de Apple. Nada queda escrito en el
// repo ni en disco tras esta llamada — el directorio temporal se borra
// antes de devolver.
export function generateFakeAppleCertBundle(): FakeAppleCertBundle {
  const dir = mkdtempSync(join(tmpdir(), "loyalty-fake-apple-cert-"));
  try {
    const passKeyPath = join(dir, "pass.key");
    const passCertPath = join(dir, "pass.crt");
    const wwdrKeyPath = join(dir, "wwdr.key");
    const wwdrCertPath = join(dir, "wwdr.crt");

    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${passKeyPath}" -out "${passCertPath}" -days 1 -subj "/CN=Fake Pass Type ID/O=Loyalty Test"`,
      { stdio: "pipe" },
    );
    execSync(
      `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${wwdrKeyPath}" -out "${wwdrCertPath}" -days 1 -subj "/CN=Fake WWDR Intermediate/O=Loyalty Test"`,
      { stdio: "pipe" },
    );

    return {
      passCertPem: readFileSync(passCertPath, "utf8"),
      passKeyPem: readFileSync(passKeyPath, "utf8"),
      wwdrCertPem: readFileSync(wwdrCertPath, "utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
