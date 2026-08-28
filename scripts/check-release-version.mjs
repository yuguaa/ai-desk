import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageManifestPath = join(projectRoot, "package.json");
const tauriConfigPath = join(projectRoot, "src-tauri", "tauri.conf.json");
const cargoManifestPath = join(projectRoot, "src-tauri", "Cargo.toml");

Promise.all([
  readFile(packageManifestPath, "utf8"),
  readFile(tauriConfigPath, "utf8"),
]).then(([packageManifestSource, tauriConfigSource]) => {
  const packageManifest = JSON.parse(packageManifestSource);
  const tauriConfig = JSON.parse(tauriConfigSource);
  const cargoMetadata = JSON.parse(execFileSync("cargo", [
    "metadata",
    "--no-deps",
    "--format-version",
    "1",
    "--manifest-path",
    cargoManifestPath,
  ], { encoding: "utf8" }));
  const cargoPackage = cargoMetadata.packages.find(({ name }) => name === packageManifest.name);

  if (!cargoPackage) {
    throw new Error(`Cargo metadata 中未找到 ${packageManifest.name}`);
  }

  const versions = {
    "package.json": packageManifest.version,
    "src-tauri/tauri.conf.json": tauriConfig.version,
    "src-tauri/Cargo.toml": cargoPackage.version,
  };
  const uniqueVersions = new Set(Object.values(versions));

  if (uniqueVersions.size !== 1) {
    throw new Error(`应用版本不一致：${JSON.stringify(versions)}`);
  }

  const version = packageManifest.version;
  const releaseTag = process.env.GITHUB_REF_TYPE === "tag"
    ? process.env.GITHUB_REF_NAME
    : process.argv[2];

  if (releaseTag && releaseTag !== `v${version}`) {
    throw new Error(`发布标签必须为 v${version}，当前为 ${releaseTag}`);
  }

  console.log(`Release version verified: v${version}`);
});
