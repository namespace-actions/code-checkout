import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { checkoutArgs } from "../src/checkout.js";

test("checkout arguments and workspace boundaries", async (t) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "checkout-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  const options = {
    repository: "",
    ref: "",
    path: ".",
    additionalRefs: [],
    workflowRepository: "acme/project",
    workflowSha: "1234567890abcdef1234567890abcdef12345678",
    workspace,
  };
  assert.deepEqual(await checkoutArgs(options), [
    "clone",
    "--",
    "github.com/acme/project@1234567890abcdef1234567890abcdef12345678",
    workspace,
  ]);
  assert.deepEqual(
    await checkoutArgs({ ...options, repository: "ACME/project" }),
    [
      "clone",
      "--",
      "github.com/ACME/project@1234567890abcdef1234567890abcdef12345678",
      workspace,
    ],
  );
  assert.deepEqual(
    await checkoutArgs({
      ...options,
      repository: "acme/other",
      path: "nested/source",
    }),
    [
      "clone",
      "--",
      "github.com/acme/other",
      path.join(workspace, "nested/source"),
    ],
  );
  assert.deepEqual(
    await checkoutArgs({
      ...options,
      ref: "feature/one",
      path: "source tree",
      additionalRefs: ["main", "release/v2"],
    }),
    [
      "clone",
      "--additional_ref",
      "main",
      "--additional_ref",
      "release/v2",
      "--",
      "github.com/acme/project@feature/one",
      path.join(workspace, "source tree"),
    ],
  );
  await assert.rejects(
    checkoutArgs({ ...options, workflowSha: "" }),
    /GITHUB_SHA/,
  );
  for (const repository of [
    "https://github.com/acme/project",
    "acme/project@main",
    "--help",
  ]) {
    await assert.rejects(
      checkoutArgs({ ...options, repository }),
      /owner\/name/,
    );
  }
  for (const destination of ["..", "../workspace-other", "/tmp/checkout"]) {
    await assert.rejects(
      checkoutArgs({ ...options, path: destination }),
      /GITHUB_WORKSPACE/,
    );
  }
  await symlink(root, path.join(workspace, "outside"));
  await assert.rejects(
    checkoutArgs({ ...options, path: "outside/new/subdir" }),
    /GITHUB_WORKSPACE/,
  );
  await rm(path.join(workspace, "outside"));
  await writeFile(path.join(workspace, "keep.txt"), "existing data");
  await assert.rejects(checkoutArgs(options), /absent or empty/);
});
