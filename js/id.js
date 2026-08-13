export function genId(prefix) {
  const rand = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).slice(0, 8);
  return `${prefix}_${rand}`;
}
