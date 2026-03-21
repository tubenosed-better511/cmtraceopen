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
 * Extract an inline value that may be a parenthesized array like `( item1, item2 )`.
 * Returns the items joined with ", ".
 */
function parseArrayValue(raw: string): string {
  // Strip outer parens and whitespace
  const inner = raw.replace(/^\(\s*/, "").replace(/\s*\)\s*;?\s*$/, "");
  // Split on comma, strip quotes from each item
  const items = inner
    .split(/\s*,\s*/)
    .map((s) => s.replace(/^"(.*)"$/, "$1").trim())
    .filter((s) => s.length > 0);
  return items.join(", ");
}

/**
 * Count top-level keys inside a brace-delimited block.
 */
function countDictKeys(block: string): number {
  let count = 0;
  let depth = 0;
  const lines = block.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    for (const ch of trimmed) {
      if (ch === "{" || ch === "(") depth++;
      if (ch === "}" || ch === ")") depth--;
    }
    if (depth === 0 && /^\s*\S+\s*=/.test(trimmed)) {
      count++;
    }
  }
  return count;
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
      // Collect lines until matching brace
      const startLine = i;
      let depth = 0;
      let block = "";
      for (let j = startLine; j < lines.length; j++) {
        const l = lines[j];
        for (const ch of l) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
        }
        block += l + "\n";
        if (depth === 0) {
          i = j + 1;
          break;
        }
      }
      if (depth !== 0) {
        i++;
        continue;
      }
      // Count keys inside the dict
      const innerMatch = block.match(/\{([\s\S]*)\}/);
      const inner = innerMatch ? innerMatch[1] : "";
      const keyCount = countDictKeys(inner);
      entries.push({
        key,
        value: `{ ${keyCount} key${keyCount !== 1 ? "s" : ""} }`,
        type: "dict",
      });
      continue;
    }

    // Case 2: value is an array  ( ... )
    if (valueStr.startsWith("(")) {
      // Might be multi-line
      let arrayStr = valueStr;
      if (!arrayStr.includes(")")) {
        // Collect until closing paren
        i++;
        while (i < lines.length) {
          arrayStr += " " + lines[i].trim();
          if (lines[i].includes(")")) {
            i++;
            break;
          }
          i++;
        }
      } else {
        i++;
      }
      entries.push({
        key,
        value: parseArrayValue(arrayStr),
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
  const mcxMatch = data.match(/mcx_preference_settings\s*=\s*\{/);
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
