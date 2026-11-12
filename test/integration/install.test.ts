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
import { installNsgit, resolveRelease } from "../../src/nsgit.js";

test("pinned releases, checksum rejection, executable install, and cache reuse", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "nsgit-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  process.env.RUNNER_TEMP = path.join(root, "temp");
  process.env.RUNNER_TOOL_CACHE = path.join(root, "tools");
  process.env.GITHUB_PATH = path.join(root, "github-path");
  await mkdir(process.env.RUNNER_TEMP);
  await writeFile(process.env.GITHUB_PATH, "");

  const release = await resolveRelease("0.1.52");
  assert.equal(release.version, "v0.1.52");
  assert.deepEqual(await resolveRelease("v0.1.52"), release);
  await assert.rejects(
    resolveRelease("0.0.0"),
    /Failed to resolve nsgit v0.0.0: HTTP \d{3}/,
  );
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
      process.platform === "win32" ? "nsgit.exe" : "nsgit",
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

  const otherRelease = await resolveRelease("v0.1.54");
  assert.equal(otherRelease.version, "v0.1.54");
  const otherExecutable = await installNsgit(otherRelease);
  assert.equal(
    path.basename(path.dirname(path.dirname(otherExecutable))),
    "0.1.54",
  );
  assert.match(
    execFileSync(otherExecutable, ["clone", "--help"], { encoding: "utf8" }),
    /clone/,
  );
  assert.equal((await stat(executable)).mtimeMs, before.mtimeMs);

  const latest = await resolveRelease("latest");
  assert.match(latest.version, /^v?\d+\.\d+\.\d+$/);
  assert.deepEqual(
    latest.tarballs,
    (await resolveRelease(latest.version)).tarballs,
  );
  const latestExecutable = await installNsgit(latest);
  assert.equal(
    path.basename(path.dirname(path.dirname(latestExecutable))),
    latest.version.replace(/^v/, ""),
  );
  assert.match(
    execFileSync(latestExecutable, ["clone", "--help"], { encoding: "utf8" }),
    /clone/,
  );
});
