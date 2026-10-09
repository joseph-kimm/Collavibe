export function withoutInternalGitEvidence<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, nested) => (
    key === "workingFileFingerprints" ? undefined : nested
  ))) as T;
}
