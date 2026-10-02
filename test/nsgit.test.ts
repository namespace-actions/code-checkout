import assert from "node:assert/strict";
import { test } from "node:test";
import { selectTarball } from "../src/nsgit.js";

test("selects the correct archive for each supported OS and architecture", () => {
  const release = {
    version: "v0.1.51",
    tarballs: [
      {
        os: "DARWIN",
        arch: "ARM64",
        url: "https://get.namespace.so/darwin_arm64.tar.gz",
        sha256: "a".repeat(64),
      },
      {
        os: "LINUX",
        arch: "AMD64",
        url: "https://get.namespace.so/linux_amd64.tar.gz",
        sha256: "b".repeat(64),
      },
      {
        os: "DARWIN",
        arch: "AMD64",
        url: "https://get.namespace.so/darwin_amd64.tar.gz",
        sha256: "c".repeat(64),
      },
      {
        os: "LINUX",
        arch: "ARM64",
        url: "https://get.namespace.so/linux_arm64.tar.gz",
        sha256: "d".repeat(64),
      },
      {
        os: "WINDOWS",
        arch: "AMD64",
        url: "https://get.namespace.so/windows_amd64.tar.gz",
        sha256: "e".repeat(64),
      },
    ],
  };
  assert.equal(selectTarball(release, "linux", "x64").sha256, "b".repeat(64));
  assert.equal(selectTarball(release, "linux", "arm64").sha256, "d".repeat(64));
  assert.equal(selectTarball(release, "darwin", "x64").sha256, "c".repeat(64));
  assert.equal(
    selectTarball(release, "darwin", "arm64").sha256,
    "a".repeat(64),
  );
  assert.equal(selectTarball(release, "win32", "x64").sha256, "e".repeat(64));
  assert.throws(() => selectTarball(release, "freebsd", "x64"), /Unsupported/);
  assert.throws(() => selectTarball(release, "linux", "ia32"), /Unsupported/);
  assert.throws(
    () => selectTarball({ ...release, version: "../../1" }, "linux", "x64"),
    /version/,
  );
  assert.throws(
    () => selectTarball({ ...release, tarballs: [] }, "linux", "x64"),
    /Missing/,
  );
  const archive = release.tarballs[1];
  assert.throws(
    () =>
      selectTarball(
        { ...release, tarballs: [{ ...archive, sha256: "" }] },
        "linux",
        "x64",
      ),
    /checksum/,
  );
  for (const url of [
    "http://get.namespace.so/linux.tar.gz",
    "https://example.com/linux.tar.gz",
  ]) {
    assert.throws(
      () =>
        selectTarball(
          { ...release, tarballs: [{ ...archive, url }] },
          "linux",
          "x64",
        ),
      /URL/,
    );
  }
});
