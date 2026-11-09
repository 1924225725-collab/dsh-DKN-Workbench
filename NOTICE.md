# Notices

DKN Agent combines original Codex integration code with the domestic and international CodeBuddy CLI plugin components supplied by the user from `dsh-workbuddy-plugin/unified` (package version 1.0.4). The two CodeBuddy provider implementations and their regional separation are retained; their displayed embedded version is 1.0.4.

Selected Agent Hub 2.3.1 backend and domain modules supplied by the user are incorporated under the MIT license included at docs/agent-hub/LICENSE. The embedded variant replaces standalone transports, setup and desktop opening with DSH-local adapters. It does not distribute the original Flutter/Tauri UI or automatically migrate original user data.

The ZCode model bridge under lib/zcode is adapted from https://github.com/tangyixiao/dsh-zcode-plan-bridge, licensed under AGPL-3.0. It retains the upstream app-server protocol, dynamic catalogue, streaming, image materialization, session reuse and authorization handling. The bridge is vendored here so the model provider can be configured from the DKN Agent model page.

The DSH, Codex, Claude Code and CodeBuddy names identify compatible products and protocols. This package is not an official product of their respective vendors and does not include their Agent runtimes or desktop distributions. Official runtimes must be installed separately.
