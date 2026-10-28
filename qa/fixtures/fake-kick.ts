// A stand-in for kickPush (src/lib/push/kick.ts) in the account deletion fixture: it counts, so the check can see that
// asking tells the phones of those who carry the request out.
const w = window as unknown as { __kicks: number };
w.__kicks = 0;

export function kickPush(): void {
  w.__kicks += 1;
}
