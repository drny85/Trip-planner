import { zodSchema } from "ai";
import { expect, test } from "vitest";
import type { z } from "zod";
import { extractedBookingsSchema } from "./lib/bookings";
import { packingSchema } from "./lib/packingAi";
import { promptBriefSchema } from "./lib/promptBrief";
import { storySchema } from "./lib/story";
import { generatedTripSchema, localPickSchema, replanSchema, tipsSchema } from "./lib/tripSchema";

/**
 * Every schema we ask a model to fill goes to Claude as a native structured-output
 * format (ai.ts sets structuredOutputMode "outputFormat"). The Claude API rejects a
 * schema with more than 24 optional fields or 16 union-typed fields, and closes
 * open objects (maps) so the model can only return {} for them.
 * https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 */
const SCHEMAS: Record<string, z.ZodType> = { generatedTripSchema, replanSchema, localPickSchema, tipsSchema, extractedBookingsSchema, packingSchema, promptBriefSchema, storySchema };

type Node = Record<string, unknown>;
const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

function stats(node: unknown, root: Node): { optional: number; unions: number; open: boolean } {
  const out = { optional: 0, unions: 0, open: false };
  if (!isNode(node)) return out;
  const add = (child: unknown) => {
    const s = stats(child, root);
    out.optional += s.optional;
    out.unions += s.unions;
    out.open ||= s.open;
  };
  if (typeof node.$ref === "string") add(node.$ref.split("/").slice(1).reduce<unknown>((n, k) => (isNode(n) ? n[k] : undefined), root));
  if (Array.isArray(node.anyOf) || Array.isArray(node.oneOf) || Array.isArray(node.type)) out.unions += 1;
  if (node.additionalProperties === true || isNode(node.additionalProperties)) out.open = true;
  if (node.type === "object" && !isNode(node.properties) && node.additionalProperties !== false) out.open = true;
  if (isNode(node.properties)) {
    const required = new Set(Array.isArray(node.required) ? node.required : []);
    out.optional += Object.keys(node.properties).filter((k) => !required.has(k)).length;
    Object.values(node.properties).forEach(add);
  }
  for (const key of ["items", "additionalProperties"]) add(node[key]);
  for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"]) if (Array.isArray(node[key])) (node[key] as unknown[]).forEach(add);
  return out;
}

test.each(Object.entries(SCHEMAS))("%s fits Claude's structured-output limits", async (_name, schema) => {
  const json = (await zodSchema(schema).jsonSchema) as Node;
  const s = stats(json, json);
  expect(s.optional).toBeLessThanOrEqual(24);
  expect(s.unions).toBeLessThanOrEqual(16);
  expect(s.open).toBe(false);
});
