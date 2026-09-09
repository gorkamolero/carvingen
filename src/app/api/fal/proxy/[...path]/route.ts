import { falProxyRouteHandler } from "@/lib/fal/proxy-config";

export const runtime = "nodejs";

export const { GET, POST, PUT } = falProxyRouteHandler;
