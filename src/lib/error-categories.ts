/**
 * Shared mapping from error code category labels to Fluent UI Badge colors.
 * Used by both ErrorLookupDialog and InfoPane to avoid cross-feature coupling.
 */
export function getCategoryColor(
  category: string
):
  | "informative"
  | "warning"
  | "success"
  | "important"
  | "severe"
  | "danger" {
  switch (category) {
    case "Windows":
      return "informative";
    case "Windows Update":
      return "informative";
    case "BITS":
      return "informative";
    case "Intune":
      return "warning";
    case "ConfigMgr":
      return "success";
    case "App Install":
      return "important";
    case "Certificate":
      return "severe";
    case "Security":
      return "danger";
    case "Network":
      return "informative";
    case "Delivery Optimization":
      return "important";
    case "Registry":
      return "informative";
    case "File System":
      return "informative";
    default:
      return "informative";
  }
}
