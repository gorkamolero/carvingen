export class CaptureUnavailableError extends Error {
  constructor(public code: "PLAYWRIGHT_UNAVAILABLE" | "FFMPEG_UNAVAILABLE", message: string) { super(message); }
}
