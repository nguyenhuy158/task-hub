# Task Hub development

- Communicate briefly in Vietnamese. Ask about unclear product choices rather than guessing.
- Inspect first, present a concrete plan, and obtain approval before changing code, tests, configuration or design. Once approved, complete that scope without asking again for routine steps.
- Use pnpm 11.25.0. Node 26.7.0 is the verified local/CI/Docker runtime. Prefix shell calls with `rtk` where available; `rtk proxy` preserves raw behavior. Do not use sed.
- Begin from a GitHub issue and its acceptance criteria. P0 means local MVP, P1 means readiness for real data, P2 means extensions. Issues and Milestones own status; docs hold decisions and design.
- Use an issue branch and PR for new work. Preserve others' changes. Do not amend commits or force-push. Publishing follows the user's authorization for the current task.
- Run `pnpm run setup` for isolated synthetic dev fixtures, then `pnpm dev`. `pnpm setup` is pnpm's own command, not the project bootstrap.
- Never delete or reset existing dev data, replace token files, print credentials, or seed a production database. A partial bootstrap must be inspected before recovery. Never deploy without explicit authorization naming the target/action.
- OpenAPI is the FE/BE contract. Update `openapi.yaml` and backend together; generate FE types using `pnpm api:types`. Use the shared service rules for REST and MCP.
- Keep changes small. No code comments, unrelated abstractions or new dependencies without a concrete need.
- Validate with `pnpm check`, `pnpm test`, `pnpm openapi:check`, `pnpm api:types`, `pnpm build`. Verify CI on the exact head commit before claiming the change passed.
- UI changes need the approved design and desktop/mobile evidence. The archived prototype is not approved UI. Use the authorized browser workflow from the parent workspace.
- Add evidence and remaining limits to the issue, then update MVP tracker #13. Close an issue only when its acceptance criteria pass; a production requirement remains open until its deployment evidence exists.
- Public docs must not contain internal host inventory, work data or secrets. Runtime data, tokens and generated outputs remain ignored.
