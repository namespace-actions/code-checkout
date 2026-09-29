import { realpath, readdir } from "node:fs/promises";
import * as path from "node:path";

interface CheckoutOptions {
  repository: string;
  ref: string;
  path: string;
  additionalRefs: string[];
  workflowRepository: string;
  workflowSha: string;
  workspace: string;
}

export async function checkoutArgs(
  options: CheckoutOptions,
): Promise<string[]> {
  const repository = options.repository || options.workflowRepository;
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) {
    throw new Error("repository must be in owner/name form");
  }
  if (!options.workspace) {
    throw new Error("GITHUB_WORKSPACE is required");
  }
  const workspace = await realpath(options.workspace);
  if (path.isAbsolute(options.path)) {
    throw new Error("path must be relative to GITHUB_WORKSPACE");
  }
  const destination = path.resolve(workspace, options.path);
  assertWithinWorkspace(workspace, destination);

  // Check existing parents too: a path lexically inside the workspace can escape via a symlink.
  let parent = destination;
  while (true) {
    try {
      assertWithinWorkspace(workspace, await realpath(parent));
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      parent = path.dirname(parent);
    }
  }
  try {
    if ((await readdir(destination)).length !== 0) {
      throw new Error("Checkout destination must be absent or empty");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const sameRepository =
    repository.toLowerCase() === options.workflowRepository.toLowerCase();
  const ref = options.ref || (sameRepository ? options.workflowSha : "");
  if (sameRepository && !ref) {
    throw new Error("GITHUB_SHA or an explicit ref is required");
  }
  const args = ["clone"];
  for (const additionalRef of options.additionalRefs) {
    args.push("--additional_ref", additionalRef);
  }
  args.push(
    "--",
    `github.com/${repository}${ref ? `@${ref}` : ""}`,
    destination,
  );
  return args;
}

function assertWithinWorkspace(workspace: string, destination: string): void {
  const relative = path.relative(workspace, destination);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("path must stay within GITHUB_WORKSPACE");
  }
}
