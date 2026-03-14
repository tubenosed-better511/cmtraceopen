# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-03-13

### Highlights

CMTrace Open 0.3.0 expands the app from a log viewer with Intune diagnostics into a broader troubleshooting tool for Windows management and identity issues. This release adds a dedicated DSRegCmd troubleshooting workspace, supports startup file handling through Windows file association flows, and prepares signed Windows release artifacts for easier distribution in managed environments.

![main workspace of the dsregcmd space](references/dsregcmd1.png)

### Added

- Added a dedicated DSRegCmd troubleshooting workspace for `dsregcmd /status` analysis.
- Added live DSRegCmd capture support so local troubleshooting can collect command output directly from the app.
- Added support for loading DSRegCmd data from pasted text, standalone text captures, and evidence bundles.
- Added bundle-aware DSRegCmd source resolution so the app can recognize valid bundle roots, `evidence` folders, and `command-output` folders.
- Added registry-backed Windows Hello for Business evidence loading using PolicyManager exports and Windows policy hives.
- Added support for Microsoft policy hive correlation under PassportForWork locations such as `HKLM\SOFTWARE\Microsoft\Policies\PassportForWork` and `HKCU\SOFTWARE\Microsoft\Policies\PassportForWork`.
- Added richer DSRegCmd diagnostics including join posture interpretation, failure phase detection, capture confidence, PRT state, MDM signal evaluation, certificate checks, and NGC/Windows Hello context.
- Added a DSRegCmd troubleshooting guide in [DSREGCMD_TROUBLESHOOTING.md](DSREGCMD_TROUBLESHOOTING.md) with walkthroughs and screenshots for the new workspace.
- Added Windows runtime file association handling for `.log` and `.lo_` files.
- Added a standalone prompt flow that can offer to associate log files with CMTrace Open.
- Added startup file-path handoff so the app can consume an associated file path once on launch and route it through the normal open flow.
- Added signed Windows release packaging coverage in the release workflow for x64 and arm64 artifacts.

### Improved

- Improved support for UTF-16 registry export files so `reg.exe export` artifacts can be parsed reliably.
- Improved the startup experience for associated log-file opens by routing them through the same frontend source-loading flow used for other file opens.

### Documentation

- Added end-user documentation for the DSRegCmd troubleshooting workspace.
- Expanded the project’s troubleshooting story beyond log parsing to include device-identity and Windows Hello investigations.

### Notes For Upgraders

- Existing log-viewing and Intune analysis workflows remain intact.
- Windows users opening `.log` or `.lo_` files through Explorer can now route those files directly into CMTrace Open after association is enabled.
- DSRegCmd troubleshooting is most effective when using live capture or a complete evidence bundle that includes registry artifacts.
