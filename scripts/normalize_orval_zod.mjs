import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const apiPath = fileURLToPath(
  new URL("../lib/api-zod/src/generated/api.ts", import.meta.url),
);
const typesIndexPath = fileURLToPath(
  new URL("../lib/api-zod/src/generated/types/index.ts", import.meta.url),
);

// Orval correctly models multipart files as `instanceof(File)`, but this
// package is also imported by the Node API server where `File` is not a
// guaranteed global. Multer performs the actual file validation, so keep the
// generated contract runtime-safe in both browser and Node environments.
const api = await readFile(apiPath, "utf8");
const normalizedApi = api.replaceAll("zod.instanceof(File)", "zod.any()");
await writeFile(apiPath, normalizedApi, "utf8");

// Orval emits operation-body TypeScript interfaces in `generated/types` and
// Zod schemas with the same names in `generated/api`. Alias only real
// operation-body collisions so the package barrel can continue exporting both collections.
const aliases = new Map([
  [
    "export * from './postAiAssistantBody';",
    "export type { PostAiAssistantBody as PostAiAssistantBodyType } from './postAiAssistantBody';",
  ],
  [
    "export * from './updatePreferencesBody';",
    "export type { UpdatePreferencesBody as UpdatePreferencesBodyType } from './updatePreferencesBody';",
  ],
]);

let typesIndex = await readFile(typesIndexPath, "utf8");
for (const [source, replacement] of aliases) {
  typesIndex = typesIndex.replace(source, replacement);
}
await writeFile(typesIndexPath, typesIndex, "utf8");

if (normalizedApi.includes("zod.instanceof(File)")) {
  throw new Error("Generated Zod output still references the Node-unsafe File global");
}
for (const replacement of aliases.values()) {
  if (!typesIndex.includes(replacement)) {
    throw new Error(`Generated Zod type export was not normalized: ${replacement}`);
  }
}
