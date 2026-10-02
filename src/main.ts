import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { checkoutArgs } from "./checkout.js";
import { installNsgit, latestRelease } from "./nsgit.js";

async function run(): Promise<void> {
  const args = await checkoutArgs({
    repository: core.getInput("repository"),
    ref: core.getInput("ref"),
    path: core.getInput("path") || ".",
    additionalRefs: core.getMultilineInput("additional-refs"),
    workflowRepository: process.env.GITHUB_REPOSITORY || "",
    workflowSha: process.env.GITHUB_SHA || "",
    workspace: process.env.GITHUB_WORKSPACE || "",
  });
  const executable = await installNsgit(await latestRelease());
  await exec(`"${executable}"`, args);
}

run().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
