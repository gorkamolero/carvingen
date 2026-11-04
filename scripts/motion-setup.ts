import { ensureMotionPython } from "@/lib/character/motion-env";
ensureMotionPython(console.log).then(() => console.log("Motion Python ready")).catch((e) => { console.error(e.message); process.exitCode = 1; });
