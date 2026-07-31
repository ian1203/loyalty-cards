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
export function createRealPkpassSigner(credentials: ApplePassCertificate): PkpassSigner {
  return async (manifestJson: Buffer): Promise<Buffer> => {
    const cert = forge.pki.certificateFromPem(credentials.passCertPem);
    const wwdrCert = forge.pki.certificateFromPem(credentials.wwdrCertPem);
    const privateKey = forge.pki.privateKeyFromPem(credentials.passKeyPem);

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
