import { verifyMessage, type Address, type Hex } from "viem";
import { issuedAtOf, signatureWindowMs } from "shared";

export async function verifySigned(
  address: Address,
  message: string,
  signature: Hex,
  now: number,
): Promise<string | null> {
  const issued = issuedAtOf(message);
  if (issued === null) return "Message has no issue time";
  if (Math.abs(now - issued) > signatureWindowMs) return "Signature is too old";
  const valid = await verifyMessage({ address, message, signature }).catch(() => false);
  return valid ? null : "Signature does not match the address";
}
