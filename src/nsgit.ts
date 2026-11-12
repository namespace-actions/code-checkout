import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, rm } from "node:fs/promises";
import * as path from "node:path";

interface Tarball {
  os: string;
  arch: string;
  url: string;
  sha256: string;
}

export interface Release {
  version: string;
  tarballs: Tarball[];
}

export async function resolveRelease(version: string): Promise<Release> {
  if (version === "latest") {
    const response = await fetch(
      "https://private-api.global.namespaceapis.com/nsl.versions.VersionsService/GetLatest",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nsgit: {} }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Failed to resolve latest nsgit release: HTTP ${response.status}`,
      );
    }
    return (await response.json()) as Release;
  }
  if (!/^v?\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      "nsgit-version must be latest or an exact version such as v0.1.53",
    );
  }
  const tag = `v${version.replace(/^v/, "")}`;
  const baseURL = `https://get.namespace.so/packages/nsgit/${tag}`;
  const response = await fetch(`${baseURL}/nsgit.json`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to resolve nsgit ${tag}: HTTP ${response.status}`);
  }
  const manifest = (await response.json()) as {
    tool: string;
    version: string;
    artifacts: {
      filename: string;
      os: string;
      arch: string;
      sha256: string;
    }[];
  };
  if (manifest.tool !== "nsgit" || manifest.version !== tag) {
    throw new Error(`Unexpected release manifest for nsgit ${tag}`);
  }
  return {
    version: tag,
    tarballs: manifest.artifacts.map((artifact) => ({
      os: artifact.os,
      arch: artifact.arch,
      url: `${baseURL}/${artifact.filename}`,
      sha256: artifact.sha256,
    })),
  };
}

export function selectTarball(
  release: Release,
  platform: string,
  architecture: string,
): Tarball {
  const os = { linux: "LINUX", darwin: "DARWIN", win32: "WINDOWS" }[platform];
  const arch = { x64: "AMD64", arm64: "ARM64" }[architecture];
  if (!os || !arch) {
    throw new Error(`Unsupported runner platform: ${platform}/${architecture}`);
  }
  if (!/^v?\d+\.\d+\.\d+$/.test(release.version)) {
    throw new Error("Invalid nsgit release version");
  }
  const tarball = release.tarballs.find(
    (item) => item.os === os && item.arch === arch,
  );
  if (!tarball || !/^[a-fA-F0-9]{64}$/.test(tarball.sha256)) {
    throw new Error(
      `Missing nsgit tarball or checksum for ${platform}/${architecture}`,
    );
  }
  const url = new URL(tarball.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "get.namespace.so" ||
    !url.pathname.endsWith(".tar.gz")
  ) {
    throw new Error("Invalid nsgit download URL");
  }
  return tarball;
}

export async function installNsgit(release: Release): Promise<string> {
  const tarball = selectTarball(release, process.platform, process.arch);
  const version = release.version.replace(/^v/, "");
  const executableName = process.platform === "win32" ? "nsgit.exe" : "nsgit";
  let directory = tc.find("nsgit", version, process.arch);
  if (directory) {
    core.info(`Using cached nsgit ${version}`);
  } else {
    core.info(
      `Downloading nsgit ${version} for ${process.platform}/${process.arch}`,
    );
    const archive = await tc.downloadTool(tarball.url);
    let extracted: string | undefined;
    try {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(archive)) hash.update(chunk);
      if (hash.digest("hex") !== tarball.sha256.toLowerCase()) {
        throw new Error("nsgit archive checksum mismatch");
      }
      extracted = await tc.extractTar(archive);
      const executable = path.join(extracted, executableName);
      if (process.platform !== "win32") await chmod(executable, 0o755);
      directory = await tc.cacheFile(
        executable,
        executableName,
        "nsgit",
        version,
        process.arch,
      );
    } finally {
      await rm(archive, { force: true });
      if (extracted) await rm(extracted, { recursive: true, force: true });
    }
  }
  core.addPath(directory);
  return path.join(directory, executableName);
}
