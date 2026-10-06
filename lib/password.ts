import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
const scrypt = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt);
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algo, salt, hex] = encoded.split(":");
  if (algo !== "scrypt" || !salt || !hex || hex.length !== 128) return false;
  const hash = await scrypt(password, salt);
  return timingSafeEqual(hash, Buffer.from(hex, "hex"));
}
