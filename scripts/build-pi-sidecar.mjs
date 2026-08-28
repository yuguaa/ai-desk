import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tauriRoot = join(projectRoot, "src-tauri");
const packageEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
const packageRoot = dirname(dirname(packageEntry));
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const expectedPiVersion = (await readFile(join(tauriRoot, "pi-runtime-version.txt"), "utf8")).trim();
if (packageJson.version !== expectedPiVersion) {
  throw new Error(`Pi 依赖版本不匹配，期望 ${expectedPiVersion}，实际 ${packageJson.version}`);
}
const { triple, bunTarget, extension } = targetForCurrentPlatform();
const outputDir = join(tauriRoot, "binaries");
const outputPath = join(outputDir, `pi-${triple}${extension}`);
const runtimeDir = join(tauriRoot, "resources", "pi-runtime");
const stagingRoot = join(tauriRoot, ".pi-sidecar-staging", `${process.pid}-${Date.now()}`);
const stagedOutputPath = join(stagingRoot, `pi-${triple}${extension}`);
const stagedRuntimeDir = join(stagingRoot, "pi-runtime");

await mkdir(stagingRoot, { recursive: true });

try {
  execFileSync(resolveBun(), [
    "build",
    "--compile",
    `--target=${bunTarget}`,
    "--no-compile-autoload-bunfig",
    join(packageRoot, "dist", "bun", "cli.js"),
    join(packageRoot, "dist", "utils", "image-resize-worker.js"),
    "--outfile",
    stagedOutputPath,
  ], { cwd: projectRoot, stdio: "inherit" });

  await Promise.all([
    cp(join(packageRoot, "package.json"), join(stagedRuntimeDir, "package.json")),
    copyDirectory(join(packageRoot, "dist", "modes", "interactive", "theme"), join(stagedRuntimeDir, "theme")),
    copyDirectory(join(packageRoot, "dist", "modes", "interactive", "assets"), join(stagedRuntimeDir, "assets")),
    copyDirectory(join(packageRoot, "dist", "core", "export-html"), join(stagedRuntimeDir, "export-html")),
  ]);

  const packageRequire = createRequire(join(packageRoot, "package.json"));
  const photonManifestPath = packageRequire.resolve("@silvia-odwyer/photon-node/package.json");
  const photonManifest = JSON.parse(await readFile(photonManifestPath, "utf8"));
  const expectedPhotonVersion = packageJson.dependencies["@silvia-odwyer/photon-node"];
  if (photonManifest.version !== expectedPhotonVersion) {
    throw new Error(`photon-node 版本不匹配，期望 ${expectedPhotonVersion}，实际 ${photonManifest.version}`);
  }
  await cp(join(dirname(photonManifestPath), "photon_rs_bg.wasm"), join(stagedRuntimeDir, "photon_rs_bg.wasm"));
  await writeFile(join(stagedRuntimeDir, "runtime.json"), `${JSON.stringify({ version: expectedPiVersion, triple }, null, 2)}\n`);

  await mkdir(outputDir, { recursive: true });
  await rm(outputPath, { force: true });
  await rename(stagedOutputPath, outputPath);
  await rm(runtimeDir, { recursive: true, force: true });
  await mkdir(dirname(runtimeDir), { recursive: true });
  await rename(stagedRuntimeDir, runtimeDir);
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}

console.log(`Prepared Pi ${expectedPiVersion} sidecar for ${triple}`);

function resolveBun() {
  try {
    execFileSync("bun", ["--version"], { stdio: "ignore" });
    return "bun";
  } catch {
    throw new Error("构建 Pi sidecar 需要 Bun，请先安装 Bun 1.3 或更高版本");
  }
}

function targetForCurrentPlatform() {
  const key = `${process.platform}:${process.arch}`;
  const targets = {
    "darwin:arm64": { triple: "aarch64-apple-darwin", bunTarget: "bun-darwin-arm64", extension: "" },
    "darwin:x64": { triple: "x86_64-apple-darwin", bunTarget: "bun-darwin-x64", extension: "" },
    "linux:arm64": { triple: "aarch64-unknown-linux-gnu", bunTarget: "bun-linux-arm64", extension: "" },
    "linux:x64": { triple: "x86_64-unknown-linux-gnu", bunTarget: "bun-linux-x64", extension: "" },
    "win32:x64": { triple: "x86_64-pc-windows-msvc", bunTarget: "bun-windows-x64", extension: ".exe" },
  };
  const target = targets[key];
  if (!target) throw new Error(`暂不支持为 ${key} 构建 Pi sidecar`);
  return target;
}

async function copyDirectory(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true });
}
