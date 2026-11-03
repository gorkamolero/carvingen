export function parseBlenderProgress(line: string) {
  const match = /^PROGRESS (\d{1,3}) (.+)$/.exec(line.trim());
  if (!match || Number(match[1]) > 100) return null;
  return { progress: Number(match[1]), status: match[2] };
}
