import forge from "node-forge";

// Firma PKCS#7/CMS detached del manifest.json de un .pkpass — el archivo
// "signature" que Apple exige dentro del zip. Firma pura: recibe bytes,
// devuelve bytes; no sabe nada de qué hay en el manifest ni arma el zip
// (eso es apple/bundle.ts). node-forge es JS puro — la impl REAL nunca
// depende del binario openssl en producción (ver
// .claude/skills/wallet-integration/SKILL.md §4).
export type PkpassSigner = (manifestJson: Buffer) => Promise<Buffer>;

export type ApplePassCertificate = {
  passCertPem: string;
  passKeyPem: string;
  wwdrCertPem: string;
};

// Firma real: PKCS#7 con la cadena completa (cert del Pass Type ID +
// intermedio WWDR de Apple, ambos requeridos por el validador de Wallet).
// En tests se alimenta con un certificado autofirmado generado por
// openssl (packages/wallet/tests/support/fakeAppleCert.ts) — corre byte a
// byte el mismo código que correría con el certificado real y pagado de
// Apple; solo cambia el certificado, nunca el código de firma.
//
// Parseo de PEM movido FUERA del closure que se ejecuta por request
// (hallazgo real de auditoría de rendimiento, ver docs/HISTORY.md):
// `getPkpassSigner()` (apps/web/lib/wallet/adapters.ts) ya memoiza el
// signer una vez por proceso, pero `createRealPkpassSigner` se llama una
// sola vez — el parseo de cert/key en cambio estaba DENTRO de la función
// devuelta, así que se repetía en cada `.pkpass` generado aunque el
// certificado nunca cambia dentro de la vida del proceso. Parsear una vez
// acá y capturarlo en el closure es la única parte cacheable: `p7.sign()`
// sigue corriendo por request a propósito, cada manifest es distinto.
export function createRealPkpassSigner(credentials: ApplePassCertificate): PkpassSigner {
  const cert = forge.pki.certificateFromPem(credentials.passCertPem);
  const wwdrCert = forge.pki.certificateFromPem(credentials.wwdrCertPem);
  const privateKey = forge.pki.privateKeyFromPem(credentials.passKeyPem);

  return async (manifestJson: Buffer): Promise<Buffer> => {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(manifestJson.toString("binary"));
    p7.addCertificate(cert);
    p7.addCertificate(wwdrCert);
    p7.addSigner({
      key: privateKey,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        // messageDigest y signingTime los completa forge automáticamente
        // al firmar — no aceptan un valor de tipo Date en la firma tipada.
        { type: forge.pki.oids.messageDigest },
        { type: forge.pki.oids.signingTime },
      ],
    });
    // detached: la firma no re-incluye el contenido — el .pkpass ya lleva
    // manifest.json aparte, no hace falta duplicarlo dentro de la firma.
    p7.sign({ detached: true });

    const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
    return Buffer.from(der, "binary");
  };
}

// Firma fake: determinística, sin criptografía real — el .pkpass resultante
// nunca sería válido para Apple, pero alcanza para probar el pipeline de
// bundle (zip con manifest+firma+assets) en dev/CI sin certificado.
export function createFakePkpassSigner(): PkpassSigner {
  return async (manifestJson: Buffer): Promise<Buffer> => {
    return Buffer.from(`FAKE-PKCS7-SIGNATURE:${manifestJson.length}`, "utf8");
  };
}
