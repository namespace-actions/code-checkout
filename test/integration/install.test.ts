import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { installNsgit, latestRelease } from "../../src/nsgit.js";

test("real download, checksum rejection, executable install, and cache reuse", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "nsgit-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  process.env.RUNNER_TEMP = path.join(root, "temp");
  process.env.RUNNER_TOOL_CACHE = path.join(root, "tools");
  process.env.GITHUB_PATH = path.join(root, "github-path");
  await mkdir(process.env.RUNNER_TEMP);
  await writeFile(process.env.GITHUB_PATH, "");

  const release = await latestRelease();
  await assert.rejects(
    installNsgit({
      ...release,
      tarballs: release.tarballs.map((archive) => ({
        ...archive,
        sha256: "0".repeat(64),
      })),
    }),
    /checksum mismatch/,
  );
  assert.deepEqual(await readdir(process.env.RUNNER_TEMP), []);

  const executable = await installNsgit(release);
  assert.equal(
    executable,
    path.join(
      process.env.RUNNER_TOOL_CACHE,
      "nsgit",
      release.version.replace(/^v/, ""),
      process.arch,
      "nsgit",
    ),
  );
  assert.match(
    execFileSync(executable, ["clone", "--help"], { encoding: "utf8" }),
    /clone/,
  );
  await stat(`${path.dirname(executable)}.complete`);
  assert.ok(
    (await readFile(process.env.GITHUB_PATH, "utf8")).includes(
      path.dirname(executable),
    ),
  );
  const before = await stat(executable);

  // A cache hit must not attempt to download this nonexistent archive.
  const cached = await installNsgit({
    ...release,
    tarballs: release.tarballs.map((archive) => ({
      ...archive,
      url: "https://get.namespace.so/nonexistent-cache-test.tar.gz",
    })),
  });
  assert.equal(cached, executable);
  assert.equal((await stat(cached)).mtimeMs, before.mtimeMs);
  assert.deepEqual(await readdir(process.env.RUNNER_TEMP), []);
});
