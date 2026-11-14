# Notices

DKN Agent combines original Codex integration code with the domestic and international CodeBuddy CLI plugin components supplied by the user from `dsh-workbuddy-plugin/unified` (package version 1.0.4). The two CodeBuddy provider implementations and their regional separation are retained; their displayed embedded version is 1.0.4.

Selected Agent Hub 2.3.1 backend and domain modules supplied by the user are incorporated under the MIT license included at docs/agent-hub/LICENSE. The embedded variant replaces standalone transports, setup and desktop opening with DSH-local adapters. It does not distribute the original Flutter/Tauri UI or automatically migrate original user data.

The ZCode model bridge under lib/zcode is adapted from https://github.com/tangyixiao/dsh-zcode-plan-bridge, licensed under AGPL-3.0. It retains the upstream app-server protocol, dynamic catalogue, streaming, image materialization, session reuse and authorization handling. The bridge is vendored here so the model provider can be configured from the DKN Agent model page.

The DSH, Codex, Claude Code and CodeBuddy names identify compatible products and protocols. This package is not an official product of their respective vendors and does not include their Agent runtimes or desktop distributions. Official runtimes must be installed separately.

The account quota and daily reward integration references CreditDaddy's MIT-licensed protocol work (https://github.com/techysy/CreditDaddy, revision 033246083728e6713d272c33ebb50adf58ac762f). Its license is retained at docs/compatibility/CreditDaddy-LICENSE. The plugin implements account queries and explicit user-triggered daily claims for CodeBuddy China and Qoder International. It does not bundle that project's account-switching, token-refresh, device-identity generation or CAPTCHA automation. Qoder quota queries implement the official SDK daemon v2 account-query protocol without bundling the SDK; daily rewards use the current Windows Qoder International desktop login, separately from the CLI login.
