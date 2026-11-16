export const reflectionSources = {
  unspecified: "Authorship not specified",
  personal: "Personal writing · author confirmed",
  ai_assisted: "Personal writing · AI assistance",
  synthetic: "Synthetic demo · not personal learning evidence",
};
export function reflectionSourceLabel(value) {
  return typeof value === "string" && Object.hasOwn(reflectionSources, value) ? reflectionSources[value] : reflectionSources.unspecified;
}
