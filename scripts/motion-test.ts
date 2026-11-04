import { ensureMotionPython, motionCommand } from "@/lib/character/motion-env";
async function main() { await motionCommand(await ensureMotionPython(console.log), ["-m", "unittest", "discover", "-s", "scripts/motion/tests", "-v"], console.log, { ...process.env, PYTHONDONTWRITEBYTECODE: "1", OMP_NUM_THREADS: "2", MKL_NUM_THREADS: "2" }); }
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
