import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { buildSolidSquarePng, type RgbColor } from "./placeholderIcon";
import type { PkpassSigner } from "./signer";

// Arma el .pkpass final: pass.json + manifest.json (SHA1 por archivo, tal
// como exige Apple) + signature (PKCS#7 sobre el manifest) + los íconos
// obligatorios — todo zippeado en memoria (los pases son de pocos KB, no
// hace falta streaming). adm-zip es la única pieza de esta función que no
// es "nuestro código de firma": el criptográfico (signer) sigue siendo
// 100% node-forge/nuestro, esto solo empaqueta.
export type BuildPkpassInput = {
  passJson: Record<string, unknown>;
  signer: PkpassSigner;
  iconRgb: RgbColor;
};

function sha1(buf: Buffer): string {
  return createHash("sha1").update(buf).digest("hex");
}

export async function buildPkpass(input: BuildPkpassInput): Promise<Buffer> {
  const passJsonBuffer = Buffer.from(JSON.stringify(input.passJson), "utf8");
  const icon = buildSolidSquarePng(29, input.iconRgb);
  const icon2x = buildSolidSquarePng(58, input.iconRgb);

  const files: Record<string, Buffer> = {
    "pass.json": passJsonBuffer,
    "icon.png": icon,
    "icon@2x.png": icon2x,
  };

  const manifest: Record<string, string> = {};
  for (const [name, buf] of Object.entries(files)) {
    manifest[name] = sha1(buf);
  }
  const manifestBuffer = Buffer.from(JSON.stringify(manifest), "utf8");

  const signature = await input.signer(manifestBuffer);

  const zip = new AdmZip();
  for (const [name, buf] of Object.entries(files)) {
    zip.addFile(name, buf);
  }
  zip.addFile("manifest.json", manifestBuffer);
  zip.addFile("signature", signature);

  return zip.toBuffer();
}
