import { loadLocalEnvFile } from "@/lib/load-local-env";



type CliOptions = {
  workflowPath: string;
  baseUrl?: string;
  publicUrl?: string;
  dryRun: boolean;
  falStorageInputs: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dryRun) loadLocalEnvFile(process.cwd());
  const { loadWorkflowDefinition, runWorkflow } = await import("@/lib/workflow/runner");
  const workflow = await loadWorkflowDefinition(options.workflowPath);
  const summary = await runWorkflow(workflow, {
    baseUrl: options.baseUrl,
    publicUrl: options.publicUrl,
    dryRun: options.dryRun,
    falStorageInputs: options.falStorageInputs,
  });

  console.log(JSON.stringify(summary, null, 2));
}

function parseArgs(args: string[]): CliOptions {
  const workflowPath = args.find((arg) => !arg.startsWith("-"));
  if (!workflowPath) {
    throw new Error(
      "Usage: pnpm workflow <workflow.json> [--base-url URL] [--public-url URL] [--fal-storage-inputs] [--dry-run]",
    );
  }

  return {
    workflowPath,
    baseUrl: readFlag(args, "--base-url"),
    publicUrl: readFlag(args, "--public-url"),
    dryRun: args.includes("--dry-run"),
    falStorageInputs: args.includes("--fal-storage-inputs"),
  };
}

function readFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
