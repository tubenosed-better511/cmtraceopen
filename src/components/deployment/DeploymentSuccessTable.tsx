import { tokens } from "@fluentui/react-components";
import type { DeploymentLogFile } from "../../stores/deployment-store";

function displayName(file: DeploymentLogFile): string {
  return file.appName ?? file.fileName;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "";
  // Trim sub-second precision for compact display
  const dotIndex = ts.indexOf(".");
  return dotIndex > 0 ? ts.substring(0, dotIndex) : ts;
}

export function DeploymentSuccessTable({
  files,
}: {
  files: DeploymentLogFile[];
}) {
  return (
    <div
      style={{
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "12px",
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: tokens.colorNeutralBackground3,
              textAlign: "left",
            }}
          >
            <th style={{ padding: "6px 10px", fontWeight: 600 }}>Application</th>
            <th style={{ padding: "6px 10px", fontWeight: 600 }}>Version</th>
            <th style={{ padding: "6px 10px", fontWeight: 600 }}>Type</th>
            <th style={{ padding: "6px 10px", fontWeight: 600 }}>Format</th>
            <th style={{ padding: "6px 10px", fontWeight: 600 }}>Outcome</th>
            <th style={{ padding: "6px 10px", fontWeight: 600 }}>Exit Code</th>
            <th style={{ padding: "6px 10px", fontWeight: 600 }}>Start</th>
            <th style={{ padding: "6px 10px", fontWeight: 600 }}>End</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr
              key={file.path}
              style={{
                borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
              }}
            >
              <td
                style={{
                  padding: "5px 10px",
                }}
                title={file.fileName}
              >
                {displayName(file)}
              </td>
              <td style={{ padding: "5px 10px" }}>
                {file.appVersion ?? ""}
              </td>
              <td style={{ padding: "5px 10px" }}>
                {file.deployType ?? ""}
              </td>
              <td style={{ padding: "5px 10px" }}>{file.format}</td>
              <td
                style={{
                  padding: "5px 10px",
                  color:
                    file.outcome === "success"
                      ? tokens.colorPaletteGreenForeground1
                      : tokens.colorPaletteYellowForeground1,
                }}
              >
                {file.outcome}
              </td>
              <td style={{ padding: "5px 10px" }}>
                {file.exitCode ?? ""}
              </td>
              <td
                style={{
                  padding: "5px 10px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  color: tokens.colorNeutralForeground3,
                }}
              >
                {formatTimestamp(file.startTime)}
              </td>
              <td
                style={{
                  padding: "5px 10px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  color: tokens.colorNeutralForeground3,
                }}
              >
                {formatTimestamp(file.endTime)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
