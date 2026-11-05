// The temporary address Meta fetches a file from (MVP_draft.md 72 and 76.5): 32 random bytes in the address, only their sha256 in
// the database, so the address cannot be rebuilt from what is stored. Server only.
import { createHash, randomBytes } from 'node:crypto';

/** The temporary address's token and the hash the database keeps. */
export function newLink(): { token: string; hash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashOf(token) };
}
export const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');
