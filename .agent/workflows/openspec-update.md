---
description: Update an existing OpenSpec proposal based on discussion feedback.
---
<!-- OPENSPEC:START -->
**Guardrails**
- Favor straightforward, minimal implementations first and add complexity only when it is requested or clearly required.
- Keep changes tightly scoped to the requested outcome.
- Refer to `openspec/AGENTS.md` (located inside the `openspec/` directory—run `ls openspec` or `openspec update` if you don't see it) if you need additional OpenSpec conventions or clarifications.
- Do not write any code during the proposal update stage. Only modify design documents (proposal.md, tasks.md, design.md, and spec deltas).

**When to Use**
- After initial `/openspec-proposal` when user has feedback
- When discussion reveals design changes needed
- To sync conversation decisions into documents
- Before `/openspec-apply` to ensure docs are up-to-date

**Steps**
Track these steps as TODOs and complete them one by one.

1. Identify the target change: Run `openspec list` to confirm the change-id exists and review current state.

2. Understand the requested updates:
   - Ask clarifying questions if the feedback is vague
   - Summarize what will be changed before editing

3. Update `design.md` if architectural decisions changed:
   - Add new Decision sections with rationale
   - Mark deprecated decisions with `~~strikethrough~~`
   - Keep change history at the bottom

4. Update `tasks.md` if work items changed:
   - Add new tasks with `[ ]`
   - Remove cancelled tasks (don't just mark done)
   - Reorder if dependencies changed

5. Update `specs/<capability>/spec.md` if requirements changed:
   - Use `## MODIFIED Requirements` for changes to existing requirements
   - Use `## ADDED Requirements` for new requirements
   - Update `#### Scenario:` to match new behavior

6. Validate the updated proposal:
   ```bash
   openspec validate <change-id> --strict
   ```

7. Summarize changes made and ask user to review before proceeding.

**Quick Update Patterns**

For simple changes, use these shortcuts:

- **Change a single decision**:
  > "Update design.md: change storage from local to S3"

- **Add missing requirement**:
  > "Add to spec: file size must not exceed 2MB"

- **Update task list**:
  > "Add task: integrate OSS SDK before upload implementation"

- **Sync discussion decisions**:
  > "Write these decisions to design.md: 1. Use sharp for compression 2. Support only JPEG/PNG"

**Reference**
- Use `openspec show <id>` to review current proposal state
- Use `openspec show <id> --json --deltas-only` for detailed spec changes
- Search existing requirements with `rg -n "Requirement:" openspec/changes/<id>/specs`
<!-- OPENSPEC:END -->
