import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
export function sealBackup(value: unknown, passphrase: string) {
  if (passphrase.length < 20)
    throw Error("BACKUP_PASSPHRASE must contain at least 20 characters");
  const salt = randomBytes(16),
    iv = randomBytes(12),
    key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([
    Buffer.from("CANOPY01"),
    salt,
    iv,
    cipher.getAuthTag(),
    data,
  ]);
}
export function openBackup(bytes: Buffer, passphrase: string) {
  if (bytes.subarray(0, 8).toString() !== "CANOPY01")
    throw Error("Unsupported backup format");
  const key = scryptSync(passphrase, bytes.subarray(8, 24), 32);
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(24, 36));
  decipher.setAuthTag(bytes.subarray(36, 52));
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(52)),
      decipher.final(),
    ]).toString(),
  );
}
