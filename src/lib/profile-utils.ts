import type { MacosMdmProfile } from "../types/macos-diag";

// --- Friendly name derivation ---

const MANAGED_CLIENT_PREFIX = "com.apple.ManagedClient.preferences.";

const KNOWN_BUNDLE_NAMES: Record<string, string> = {
  "com.microsoft.OneDrive": "OneDrive",
  "com.microsoft.Edge": "Microsoft Edge",
  "com.microsoft.autoupdate2": "Microsoft AutoUpdate",
  "com.microsoft.office": "Microsoft Office",
};

/**
 * Derive a human-friendly name for a profile.
 * Returns null if no friendly name can be derived (the display name is already good).
 */
export function deriveFriendlyName(profile: MacosMdmProfile): string | null {
  // Only apply to ManagedClient.preferences profiles
  if (!profile.profileDisplayName.includes("com.apple.ManagedClient.preferences")) {
    return null;
  }

  if (!profile.profileIdentifier.startsWith(MANAGED_CLIENT_PREFIX)) {
    return null;
  }

  const bundleId = profile.profileIdentifier.slice(MANAGED_CLIENT_PREFIX.length);
  if (!bundleId) {
    return null;
  }

  // Check known bundle map first
  if (KNOWN_BUNDLE_NAMES[bundleId]) {
    return KNOWN_BUNDLE_NAMES[bundleId];
  }

  // Fall back to last segment of the bundle ID
  const segments = bundleId.split(".");
  return segments[segments.length - 1] ?? null;
}

// --- Payload data parsing ---

export interface ParsedPayloadEntry {
  key: string;
  value: string;
  type: "string" | "number" | "boolean" | "array" | "dict" | "unknown";
}

export interface ParsedPayload {
  entries: ParsedPayloadEntry[];
  appTarget?: string;
}

/**
 * Given a starting index just after an opening '{', find the matching '}'.
 * Returns the content between the braces (exclusive), or null if unmatched.
 */
function extractBracedBlock(data: string, startIndex: number): string | null {
  let depth = 1;
  let i = startIndex;
  while (i < data.length && depth > 0) {
    if (data[i] === "{") {
      depth++;
    } else if (data[i] === "}") {
      depth--;
    }
    if (depth > 0) {
      i++;
    }
  }
  if (depth !== 0) {
    return null;
  }
  return data.slice(startIndex, i);
}

/**
 * Collect a multi-line balanced block starting from an opening delimiter.
 * Works for both `(...)` and `{...}`. Returns the full collected string
 * including the opening delimiter already in `start`, and advances `i`.
 */
function collectBalancedBlock(
  lines: string[],
  startIdx: number,
  open: string,
  close: string,
): { block: string; nextIdx: number } {
  let depth = 0;
  let block = "";
  for (let j = startIdx; j < lines.length; j++) {
    const l = lines[j];
    for (const ch of l) {
      if (ch === open) depth++;
      if (ch === close) depth--;
    }
    block += l + "\n";
    if (depth === 0) {
      return { block, nextIdx: j + 1 };
    }
  }
  return { block, nextIdx: lines.length };
}

/**
 * Parse an array of dicts like Rules = ( { Comment = "X"; RuleType = Y; }, { ... } );
 * Returns entries for each dict item showing its key-value pairs.
 */
function parseArrayOfDicts(raw: string, arrayKey: string): ParsedPayloadEntry[] {
  const entries: ParsedPayloadEntry[] = [];

  // Extract content between outer parens
  const parenStart = raw.indexOf("(");
  const parenEnd = raw.lastIndexOf(")");
  if (parenStart < 0 || parenEnd < 0) return entries;
  const inner = raw.slice(parenStart + 1, parenEnd);

  // Find each dict { ... } in the inner content
  let pos = 0;
  let dictIndex = 0;
  while (pos < inner.length) {
    const braceStart = inner.indexOf("{", pos);
    if (braceStart < 0) break;
    const block = extractBracedBlock(inner, braceStart + 1);
    if (!block) break;
    pos = braceStart + 1 + block.length + 1;

    // Parse the dict entries
    const dictEntries = parseFlatDict(block);
    if (dictEntries.length > 0) {
      // Find a good label for this dict item
      const commentEntry = dictEntries.find(
        (e) => e.key.toLowerCase() === "comment",
      );
      const label = commentEntry
        ? commentEntry.value
        : `${arrayKey} [${dictIndex}]`;
      // Add a header entry for the dict
      for (const entry of dictEntries) {
        if (entry.key.toLowerCase() === "comment") continue;
        entries.push({
          key: `${label} → ${entry.key}`,
          value: entry.value,
          type: entry.type,
        });
      }
    }
    dictIndex++;
  }

  return entries;
}

/**
 * Extract a simple array value like `( "item1", "item2", item3 )`.
 * The input `raw` may contain `key = (` prefix from block collection.
 * Returns the items joined with ", ".
 */
function parseSimpleArrayValue(raw: string): string {
  // Find the opening paren and closing paren
  const parenStart = raw.indexOf("(");
  const parenEnd = raw.lastIndexOf(")");
  if (parenStart < 0 || parenEnd <= parenStart) return raw.trim();
  const inner = raw.slice(parenStart + 1, parenEnd).trim();
  const items = inner
    .split(/\s*,\s*/)
    .map((s) => s.replace(/^"(.*)"$/, "$1").trim())
    .filter((s) => s.length > 0);
  return items.join(", ");
}

/**
 * Parse flat key = value; assignments from a NeXTSTEP plist dict body (without outer braces).
 */
function parseFlatDict(body: string): ParsedPayloadEntry[] {
  const entries: ParsedPayloadEntry[] = [];
  const lines = body.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip blank lines and structural-only lines
    if (!line || line === "{" || line === "}" || line === "(" || line === ")" || line === ");") {
      i++;
      continue;
    }

    // Match key = value pattern
    const kvMatch = line.match(/^"?([^"=]+?)"?\s*=\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1].trim();
    let valueStr = kvMatch[2].trim();

    // Case 1: value is a dict  { ... }
    if (valueStr.startsWith("{")) {
      const { block, nextIdx } = collectBalancedBlock(lines, i, "{", "}");
      i = nextIdx;
      // Try to recursively parse the inner dict for display
      const innerMatch = block.match(/\{([\s\S]*)\}/);
      const inner = innerMatch ? innerMatch[1] : "";
      const innerEntries = parseFlatDict(inner);
      if (innerEntries.length > 0) {
        // Inline the inner entries with a prefix
        for (const entry of innerEntries) {
          entries.push({
            key: `${key} → ${entry.key}`,
            value: entry.value,
            type: entry.type,
          });
        }
      } else {
        entries.push({ key, value: "{ ... }", type: "dict" });
      }
      continue;
    }

    // Case 2: value is an array  ( ... )
    if (valueStr.startsWith("(")) {
      const { block, nextIdx } = collectBalancedBlock(lines, i, "(", ")");
      i = nextIdx;
      // Check if this is an array of dicts (contains '{')
      if (block.includes("{")) {
        const dictEntries = parseArrayOfDicts(block, key);
        if (dictEntries.length > 0) {
          entries.push(...dictEntries);
          continue;
        }
      }
      // Simple array of values
      entries.push({
        key,
        value: parseSimpleArrayValue(block),
        type: "array",
      });
      continue;
    }

    // Case 3: simple value (terminated by ;)
    // Remove trailing semicolon
    valueStr = valueStr.replace(/;\s*$/, "").trim();

    // Quoted string
    if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
      entries.push({
        key,
        value: valueStr.slice(1, -1),
        type: "string",
      });
      i++;
      continue;
    }

    // Number
    if (/^\d+$/.test(valueStr)) {
      const num = parseInt(valueStr, 10);
      if (num === 0 || num === 1) {
        entries.push({ key, value: valueStr, type: "boolean" });
      } else {
        entries.push({ key, value: valueStr, type: "number" });
      }
      i++;
      continue;
    }

    // Unquoted string / fallback
    entries.push({ key, value: valueStr, type: "string" });
    i++;
  }

  return entries;
}

/**
 * Parse a NeXTSTEP plist text dictionary into structured data for display.
 */
export function parsePayloadData(data: string): ParsedPayload {
  const result: ParsedPayload = { entries: [] };

  // Detect ManagedClient.preferences pattern with mcx_preference_settings
  // Key may be quoted: "mcx_preference_settings" =     {
  const mcxMatch = data.match(/"?mcx_preference_settings"?\s*=\s*\{/);
  if (mcxMatch) {
    // Extract the app target from PayloadContent
    const appMatch = data.match(/"(com\.[^"]+)"\s*=\s*\{/);
    if (appMatch) {
      result.appTarget = appMatch[1];
    }
    // Extract the mcx_preference_settings block
    const mcxStart = mcxMatch.index! + mcxMatch[0].length;
    const settingsBlock = extractBracedBlock(data, mcxStart);
    if (settingsBlock) {
      result.entries = parseFlatDict(settingsBlock);
      return result;
    }
  }

  // For non-MCX profiles, parse the top-level dict
  const trimmed = data.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    result.entries = parseFlatDict(trimmed.slice(1, -1));
  }

  return result;
}
