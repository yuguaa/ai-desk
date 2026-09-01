const LATEST_RELEASE_URL = "https://api.github.com/repos/yuguaa/ai-desk/releases/latest";
const STABLE_VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;

type VersionParts = readonly [major: number, minor: number, patch: number];

export type AppUpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
};

export function checkForAppUpdate(currentVersion: string): Promise<AppUpdateInfo> {
  const current = parseStableVersion(currentVersion, "当前应用版本格式无效");

  return fetch(LATEST_RELEASE_URL, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  })
    .then((response) => {
      if (!response.ok) throw new Error(`检查更新失败（HTTP ${response.status}）`);
      return response.json() as Promise<unknown>;
    })
    .then((payload) => {
      const tagName = releaseTagName(payload);
      const latest = parseStableVersion(tagName, "最新版本信息格式无效");
      return {
        currentVersion: formatVersion(current),
        latestVersion: formatVersion(latest),
        updateAvailable: compareVersions(latest, current) > 0,
      };
    });
}

function releaseTagName(payload: unknown) {
  if (!payload || typeof payload !== "object") throw new Error("最新版本信息格式无效");
  const tagName = (payload as { tag_name?: unknown }).tag_name;
  if (typeof tagName !== "string") throw new Error("最新版本信息格式无效");
  return tagName;
}

function parseStableVersion(value: string, errorMessage: string): VersionParts {
  const matched = value.trim().match(STABLE_VERSION_PATTERN);
  if (!matched) throw new Error(errorMessage);
  return [Number(matched[1]), Number(matched[2]), Number(matched[3])];
}

function compareVersions(left: VersionParts, right: VersionParts) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function formatVersion(version: VersionParts) {
  return version.join(".");
}
