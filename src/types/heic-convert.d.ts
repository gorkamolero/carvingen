declare module "heic-convert" {
  type ConvertOptions = {
    buffer: Buffer;
    format: "JPEG" | "PNG";
    quality?: number;
  };

  export default function heicConvert(options: ConvertOptions): Promise<Buffer>;
}
