# git restore . 后，我找回了代码：一次数据恢复的全记录

> **TL;DR**: IDE 内置 AI 助手执行 `git reset --soft HEAD~2 && git restore .` 导致 ~220 个未暂存文件的修改永久丢失。在 git reflog、fsck、Time Machine 全部失败后，我通过 IDE 本地时间线恢复了 67 个文件，从 Claude CLI 的会话日志中重建了 84 个文件，最后从被忽略了 4 天的 git dangling commits 中找回了更完整的版本。本文完整记录了这次事故的经过、每一种恢复手段的成败、一个此前从未被讨论过的恢复向量——**AI 编程助手的操作日志**，以及一个本该最先检查却被忽略到最后的恢复来源——**git dangling commits**。

---

## 一、事故概述

**日期**：2026-02-11

**项目**：WordRhyme —— 一个 Contract-First 的 Headless CMS，monorepo 结构，NestJS + Drizzle + React 技术栈。

**事故前状态**：`feature/init` 分支上有约 580 个未提交的文件变更，其中：

| 状态 | 数量 | 说明 |
|------|------|------|
| `??` 新增/未跟踪 | ~160 | 新模块：db、i18n、billing、storage 等 |
| `M` 已修改 | ~220 | 改动涉及 auth、permission、trpc、前端页面等 |
| `D` 已删除 | ~200 | 清理旧的 migration、废弃文档等 |

是的，580 个文件没有提交。这本身就是灾难的前奏。

---

## 二、事故经过

### 2.1 背景：多 AI 助手协作

这个项目同时使用了多个 AI 编程助手：

- **Claude CLI**（命令行工具）：负责大部分代码编写和文件操作
- **Gemini**（Antigravity IDE 内置 AI）：负责代码审查和调试
- **Codex**：辅助分析

事故当天，我先用 Claude CLI 完成了 4 个正常的 commit（治理文档、openspec 拆分、权限测试），然后切换到 Gemini 进行代码审查和 P0 问题修复。

### 2.2 Gemini 的操作序列

从 git reflog 还原的完整时间线：

```
17:10  commit c8c64af "WIP: 数据库架构升级"
17:39  reset → 64ce80b                        ← 回退
17:50  commit be12235 "fix P0 Critical Issues"
17:58  reset → 64ce80b                        ← 又回退
17:59  commit 47f484c "feat(i18n)"
18:03  reset → 64ce80b                        ← 又回退
18:04  commit 3664bbd "feat(db)"
18:06  reset → 64ce80b                        ← 又回退
18:12  reset → 3664bbd                        ← 跳回之前的 commit
18:32  commit 522e64d "恢复被删除核心文件"
18:40  reset → HEAD~2                         ← 致命操作
```

在 17:10 到 18:32 之间，Gemini **反复 commit-reset 了 6 次**，创建了 5 个临时 commit。这些 commit 只包含了部分文件（Gemini `git add` 了约 100 个文件），那 ~220 个 `M` 状态的修改文件**从未被暂存过**。

### 2.3 致命一击

**精确时间**：`2026-02-11 18:40:12 +0800`

Gemini 发现之前的 commit 删除了约 112 个 `apps/server` 文件，于是创建了 `backup/before-recovery` 分支作为安全措施，然后执行了三步操作：

```bash
git reset --soft HEAD~2      # 回退 2 个 commit，改动保留在暂存区
git restore --staged .       # 取消暂存所有文件
git restore .                # ⚠️ 致命！丢弃所有工作目录修改
```

`git restore .` 把所有未暂存的修改文件还原到 HEAD 版本。效果等同于 `git reset --hard HEAD~2`，但分三步执行。

> **注**：最初的事故报告中写的是"Claude 执行了 `git reset --hard`"。经过对 12 个 Claude CLI 会话日志的逐行审计，确认 Claude CLI 当天的 32 条 git 命令全部是非破坏性操作（diff、status、log、add、commit）。真正的致命操作是 Antigravity IDE 内置的 Gemini AI 执行的，且使用的是 `restore` 而非 `reset --hard`。

我注意到异常时，`git status` 显示的文件数从 580+ 骤降到 157。一半的工作，消失了。

---

## 三、常规恢复——全军覆没

### 3.1 git reflog

第一反应：reflog。

```bash
git reflog
```

找到了 Gemini 创建的 5 个临时 commit。逐一检查：

| Commit | 修改文件数 | 总文件数 |
|--------|-----------|---------|
| `c8c64af` | 55 | 55 |
| `be12235` | 54 | 54 |
| `47f484c` | 103 | 103 |
| `3664bbd` | 112 | 112 |
| `522e64d` | 101 | 101 |

当时的结论是：**这些 commit 不包含那 ~220 个未暂存的修改文件，git 层面无法恢复。**

这个结论**只对了一半**。后来的第四轮恢复证明，虽然这些 commit 确实不包含未暂存文件，但它们包含的 101~112 个文件中，很多有比 Timeline/Claude 日志恢复版更完整的内容。**我们在第一时间检查了 reflog，却没有充分利用它。** 这是整个恢复过程中最大的失误。

### 3.2 git stash

```bash
git stash list
```

空的。操作前没有执行 `git stash`。这本应是第一步。

### 3.3 git fsck

```bash
git fsck --no-reflogs --unreachable
```

找到 660 个 dangling blob 对象。但这些 blob 来自其他操作，不包含丢失的修改文件。

### 3.4 VS Code / IDE Local History

VS Code 的 Local History 只有 16 个系统配置文件，零个项目文件。

### 3.5 Time Machine

找到两个本地快照，但都在数据丢失之后。macOS 15.5 上 `tmutil mountlocalsnapshot` 返回 "Unrecognized verb"——API 变了。快照后来被系统自动清理。

**至此，所有常规恢复手段宣告失败。**

---

## 四、第一轮突破：IDE Timeline

正当绝望之际，我想起一件事——我用的 IDE 不是原版 VS Code。

我的开发工具是 **Antigravity**（一个 VS Code 的衍生版本）。它的 Timeline 功能独立于 VS Code 的 Local History，把历史记录存储在不同的路径下。

发送了一张 `package.json` 的 Timeline 截图后，Claude 找到了 Antigravity 的历史记录目录：

```
~/Library/Application Support/Antigravity/User/History/
```

每个子目录包含一个 `entries.json`，记录了文件的历史版本：

```json
{
  "version": 1,
  "resource": "file:///Users/denvey/.../package.json",
  "entries": [
    {
      "id": "xxxx.json",
      "timestamp": 1738920000000
    }
  ]
}
```

### 编写批量恢复脚本

我们写了一个 Python 脚本 `recover-from-timeline.py` 来批量恢复：

- **截止时间**设为 `2026-02-11 17:30`（事故发生时间），只取事故前的最新版本
- 默认 dry-run 模式，需要 `--apply` 才真正写入
- 先用 `package.json` 做单文件验证：对比 Timeline 版本和当前文件的差异，确认正确后再批量执行

### 恢复结果

| 状态 | 数量 |
|------|------|
| OK（成功恢复） | **67** |
| MISS（无记录） | 84 |
| ERR（错误） | 0 |

67 个文件回来了。但还有 84 个文件没有 Timeline 记录——它们是从未在 Antigravity 中打开过的文件，集中在 billing（13 个）、file-storage（7 个）、notifications（6 个）、lbac（4 个）等整个模块。

这些文件全部由 AI 助手在之前的会话中生成，我从未在 IDE 中打开过它们。IDE 的 Timeline 自然没有任何记录。

---

## 五、关键转折：Claude CLI 日志

到这一步，我换了一个策略——让多个 AI 模型交叉分析，看看还有没有被遗漏的恢复渠道。

我调用了一个多模型分析命令，同时让 Claude 和 Gemini 分析剩余的恢复可能性。

两个模型的一致结论：
- APFS snapshot、磁盘级恢复、swap 残留：成功率极低
- 其他 IDE 本地历史：值得检查但可能性不大

然后，**Gemini 给出了一个关键发现**：

> Claude CLI 的任务日志和文件历史中包含完整代码。路径：
> - `~/.claude/projects/{project-hash}/*.jsonl` —— 完整的会话记录
> - `~/.claude/file-history/` —— 修改前的文件快照备份

这个发现的逻辑链是这样的：

1. Claude CLI 是一个 AI 编程助手，它通过 `Write` 和 `Edit` 两个工具来操作文件
2. 每次调用 `Write`，日志中会记录**完整的文件内容**
3. 每次调用 `Edit`，日志中会记录 `old_string` → `new_string` 的替换对
4. 这些日志以 JSONL 格式存储在 `~/.claude/projects/` 目录下
5. 那 84 个 MISS 文件，**全部是之前由 Claude 生成或修改的**

立刻验证：

```bash
# 搜索 Write 操作中包含丢失文件路径的记录
grep -l "billing.repo.ts" ~/.claude/projects/-Users-denvey-*/*.jsonl
```

找到了。133 个文件的完整代码都在 Claude CLI 的会话日志中，包括全部 84 个 MISS 文件。

---

## 六、精确重建：Write + Edit 回放

### v1 脚本：提取最后一次 Write

第一版恢复脚本 `recover-from-claude-logs.py` 思路很直接：

```python
def extract_writes_from_sessions():
    """扫描所有 .jsonl 会话日志，提取每个文件最后一次 Write 的完整内容"""
    file_contents = {}  # rel_path -> (session_mtime, content)

    for session_path in sorted(sessions, key=mtime):
        for line in session_path:
            obj = json.loads(line)
            for item in obj["message"]["content"]:
                if item["type"] == "tool_use" and item["name"] == "Write":
                    rel_path = item["input"]["file_path"]  # 文件路径
                    content = item["input"]["content"]     # 完整文件内容
                    file_contents[rel_path] = content      # 保留最新版本
```

核心思想：会话按时间排序，后出现的 Write 覆盖先出现的，最终得到每个文件的最新版本。

**结果**：恢复了 80 个文件，3 个 scheduler 文件是 MISS（只有 Edit 记录没有 Write）。

但问题来了——**很多文件恢复出来的是更老的版本。**

### 为什么 v1 不够

原因在于 Claude 的工作方式：它先用 `Write` 创建一个文件的初始版本，然后用多次 `Edit` 来修改特定片段。v1 脚本只提取最后一次 `Write` 的内容，丢失了之后所有 `Edit` 操作带来的修改。

例如，`organization.ts` 这个文件在 Write 之后有 32 次 Edit 操作。v1 恢复出来的是 32 次修改前的版本。

### v2 脚本：完整操作回放

第二版脚本 `recover-from-claude-logs-v2.py` 实现了完整的 Write + Edit 回放：

```python
def replay_operations(ops):
    """回放 Write + Edit 操作序列，重建文件最终状态"""
    content = None
    edits_applied = 0
    edits_failed = 0

    for op_type, data, session_id in ops:
        if op_type == "Write":
            content = data        # Write 设定基准内容
        elif op_type == "Edit" and content is not None:
            old_string = data["old_string"]
            new_string = data["new_string"]
            if old_string in content:
                content = content.replace(old_string, new_string, 1)
                edits_applied += 1
            else:
                edits_failed += 1  # old_string 找不到，可能已被早期 Edit 修改

    return content, (edits_applied, edits_failed)
```

关键逻辑：

1. 按时间顺序收集所有 Write 和 Edit 操作
2. 遇到 Write：设定文件的基准内容
3. 遇到 Edit：在当前内容中执行 `old_string` → `new_string` 的字符串替换
4. 如果 `old_string` 在当前内容中找不到，标记为 `edits_failed`

脚本将结果分为三类：

| 状态 | 含义 |
|------|------|
| **OK** | 所有 Write + Edit 都成功应用，内容完整 |
| **WARN** | Write 成功但部分 Edit 失败，内容介于初始版本和最终版本之间 |
| **MISS** | 没有 Write 记录，只有 Edit，无法重建 |

### v2 恢复结果

| 状态 | 数量 |
|------|------|
| OK | **64** |
| WARN | 32 |
| MISS | 26 |

---

## 七、版本对比与择优

对于 32 个 WARN 文件，需要手动比较 Claude 回放版本和 Timeline 恢复版本（或 git baseline），选择更好的那个。

判断标准很简单：

- **行数更多** = 内容更完整 → 选择行数多的版本
- **架构更新** = 使用了最新的 import 路径和 API → 选择架构更新的版本
- **功能更全** = 包含更多业务逻辑 → 选择功能更全的版本

一些典型对比：

| 文件 | 当前版本 | Claude 回放版本 | 决策 |
|------|---------|----------------|------|
| `Settings.tsx` | 113 行 | 578 行 | 用 Claude 版本 |
| `menu.service.ts` | 513 行 | 612 行 | 用 Claude 版本 |
| `cache-manager.ts` | 567 行 | 619 行 | 用 Claude 版本 |
| `auth.ts` | 已是最新 | 旧版本 | 保留当前版本 |

最终 32 个 WARN 文件中：
- **20 个**：Claude 回放版本更完整，采用
- **12 个**：当前版本已是最优，保留

---

## 八、第四轮：被忽略了 4 天的宝藏

前三轮恢复在事故当天和次日完成，恢复率达到 98.6%。我以为事情结束了。

4 天后，在为这篇博客梳理事故时间线时，我重新审视了事故的 git reflog——这次不是在找"未暂存的文件是否在 git 里"，而是在追溯致命操作的精确时间。

### 发现 1：Gemini 创建的 backup 分支

```bash
git branch | grep backup
# → backup/before-recovery
```

Gemini 在执行致命操作前创建了一个安全分支 `backup/before-recovery`，指向 `522e64d`。**这个分支在事故后一直存在，但前三轮恢复中从未被检查过。**

为什么没检查？因为第一轮 reflog 分析得出了"git 层面无法恢复"的结论后，所有精力都转向了非 git 渠道（IDE Timeline、AI 日志）。`git branch` 的输出被忽略了。

### 发现 2：dangling commits 中的更完整版本

5 个临时 commit（`c8c64af`, `be12235`, `47f484c`, `3664bbd`, `522e64d`）全部还在 git 对象库中。虽然它们不包含未暂存的 ~220 个文件，但它们包含的文件中，**很多比 Timeline/Claude 日志恢复的版本更完整**——因为 Gemini 在 commit 时暂存的是当时工作目录的最新状态。

对比结果触目惊心：

| 文件 | 前三轮恢复版本 | dangling commit 版本 | 差距 |
|------|---------------|---------------------|------|
| `RoleDetail.tsx` | 184 行 | **524 行** | +340 |
| `useMenus.ts` | 170 行 | **443 行** | +273 |
| `lib/auth.tsx` | 112 行 | **213 行** | +101 |
| `AuditLogs.tsx` | 236 行 | **332 行** | +96 |
| `organization.ts` | 264 行 | **357 行** | +93 |
| `routers/menu.ts` | 338 行 | **416 行** | +78 |

前三轮恢复的文件是"能用但不完整"的版本。真正完整的版本一直躺在 git 对象库里，等了 4 天才被发现。

### 恢复与甄别

从 dangling commits 中提取了 35 个候选文件后，逐一与当前版本对比：

| 决策 | 数量 | 原因 |
|------|------|------|
| 采用恢复版 | **6** | 更完整或新增的文件 |
| 保留 HEAD | **10** | 恢复版有 bug（rawDb→db 递归、barrel 导入陷阱、API 签名错误等） |
| 需要合并 | **11** | 两个版本各有优势 |
| 忽略 | **6** | 差异 <5 行，无意义 |

这里的关键教训是：**恢复的版本不一定是正确的版本。** 那 10 个被拒绝的文件中，有的将 `rawDb` 改为 `db`（导致 ScopedDb 递归），有的触发了 barrel 导入陷阱，有的使用了错误的 API 签名。盲目恢复可能引入新 bug。

合并后的最终 11 个文件中，又有 5 个被用户确认为"已在过去 2 天重写过，应保留新版本"（比如统一权限管理后删除了 `AdminRoute.tsx`、`OrgAdminRoute.tsx`，组件化重构后 `RoleDetail.tsx` 不再需要内联 `RuleEditor`）。

最终从 dangling commits 实际采用了 6 个文件的改进。

---

## 九、如果一开始就检查 backup 分支？

事后复盘，最大的遗憾是恢复顺序。如果第一时间检查 `backup/before-recovery` 分支和 dangling commits：

**应该做的**：

```bash
# Step 1: 发现 backup 分支
git branch --all

# Step 2: 对比 backup 分支与基线
git diff --stat 64ce80b..backup/before-recovery
# → 101 files changed, +36922 insertions

# Step 3: 对比 backup 分支与当前工作目录
git diff backup/before-recovery -- apps/server/src/ apps/admin/src/

# Step 4: 从 backup 分支提取更完整的文件
git checkout backup/before-recovery -- apps/admin/src/pages/RoleDetail.tsx
```

**实际做的**：

```
Round 1: IDE Timeline → 恢复 67 个文件（很多是旧版本）
Round 2: Claude CLI 日志 Write → 恢复 80 个文件（更多旧版本）
Round 3: Claude CLI 日志 Write+Edit → 重建 64+20 个文件（部分失败）
Round 4: (4天后) dangling commits → 发现 35 个文件有更好版本
```

正确的恢复优先级应该是：

| 优先级 | 来源 | 理由 |
|--------|------|------|
| **1** | **git dangling commits / backup 分支** | 内容最完整、最可信（是真实的文件快照） |
| 2 | IDE Local History / Timeline | 文件曾在 IDE 中打开并保存 |
| 3 | AI 编程助手日志 | 需要回放重建，可能有 Edit 失败 |
| 4 | git reflog / fsck（已暂存的文件） | 仅适用于曾被 `git add` 的文件 |
| 5 | Time Machine / OS 快照 | 快照时间需要在事故之前 |

**Dangling commits 应该是第一优先级**，而不是最后。它们包含的是 Gemini 在致命操作前几分钟 `git add` 并 `commit` 的真实文件状态——比 IDE 快照和 AI 日志回放都更可靠。

---

## 十、一个从未被讨论过的恢复向量

这次事故最大的发现是：**AI 编程助手的操作日志是一种天然的文件备份机制。**

Claude CLI 的 `.jsonl` 会话日志记录了每一次文件操作的完整内容：

```jsonl
{
  "message": {
    "content": [{
      "type": "tool_use",
      "name": "Write",
      "input": {
        "file_path": "/absolute/path/to/file.ts",
        "content": "// 完整的文件内容，一字不差\nimport { ... } from '...'\n..."
      }
    }]
  }
}
```

这意味着：

1. **每次 AI 创建或重写文件**，完整内容都会被记录
2. **每次 AI 修改文件**，修改前后的文本片段都会被记录
3. 通过按时间顺序回放这些操作，可以重建文件的任意历史版本
4. 这些日志**独立于 git**，不受 `git reset --hard` 或 `git restore .` 影响

如果你大量使用 AI 编程助手（Claude CLI、Cursor、Copilot 等），你的 AI 会话日志可能就是你最后的救命稻草。

### AI 助手日志位置速查

```
# Claude CLI
~/.claude/projects/{project-hash}/*.jsonl    # 会话日志（Write/Edit 操作）
~/.claude/file-history/                       # 修改前的文件快照

# Gemini (Antigravity IDE)
~/.gemini/antigravity/brain/*/               # 任务记录
~/.gemini/antigravity/conversations/*.pb     # 对话记录（protobuf）
```

---

## 十一、最终战果

| 恢复阶段 | 来源 | 恢复/改进文件数 |
|---------|------|----------------|
| Phase 1 | Antigravity IDE Timeline | 67 |
| Phase 2 | Claude CLI 日志（OK — 完美回放） | 64 |
| Phase 3 | Claude CLI 日志（WARN — 版本择优） | 20 |
| Phase 4 | Git dangling commits（版本升级） | 6 |
| 保留 | 当前版本已是最优 | 12 |

整个过程跨越 4 天，前三轮恢复约 3-4 小时，第四轮（含博客溯源调查）约 2 小时。

---

## 十二、教训与防御性 Git 操作清单

### 根本原因

这次事故有**三个根本原因**叠加：

1. **580 个文件没有提交** —— 单次损失的上限太高
2. **AI 助手执行了破坏性操作** —— `git restore .` 丢弃了所有未暂存修改
3. **恢复时没有充分利用 git 自身的数据** —— backup 分支和 dangling commits 被忽略了 4 天

```
580 个未提交文件 + AI 执行 git restore . + 恢复时遗漏 dangling commits = 灾难 × 2
```

### 防御性操作清单

**操作前**：

- [ ] **任何破坏性 git 操作前，先 `git stash push -m "backup"`**
- [ ] 或者创建备份分支：`git checkout -b backup/pre-xxx`
- [ ] 确认 IDE 的 Local History / Timeline 功能已启用

**操作中**：

- [ ] **绝对不要在有未提交改动时使用 `git reset --hard` 或 `git restore .`**
- [ ] 优先使用 `git reset --soft`（只移动 HEAD，不动工作目录）
- [ ] 优先使用 `git restore --staged .`（只取消暂存，不丢弃修改）
- [ ] 使用 AI 编程助手时，确认它不会执行破坏性 git 命令

**事故后**：

- [ ] **第一时间检查 `git branch --all` 和 `git reflog`**
- [ ] 对比每个 dangling commit 与基线的差异
- [ ] 不要因为"未暂存文件不在 git 里"就放弃 git 层面的检查
- [ ] backup 分支可能就在那里，等你发现

**日常习惯**：

- [ ] 不要积累 580 个未提交文件
- [ ] 频繁、小批量提交
- [ ] 确认 Time Machine 或其他备份方案正在运行
- [ ] 了解你的 AI 编程助手的日志存储位置

---

## 后记

这次事故中最讽刺的三件事：

1. **Gemini 在执行致命操作前创建了 `backup/before-recovery` 分支**，说明它知道操作有风险。但它没有意识到 `git restore .` 会销毁未暂存的修改——它以为 `restore` 只是恢复被意外删除的文件。

2. **最终拯救代码的不是某个 AI 的能力，而是 AI 的日志。** Claude CLI 的 `.jsonl` 会话记录了每一次 Write/Edit 操作的完整内容，成为了意外的备份。而造成灾难的 Gemini 的日志（protobuf 格式）却无法直接读取。

3. **恢复过程中最大的失误不是技术性的，而是认知性的。** "git 层面无法恢复"这个早期结论导致了 4 天的盲区。dangling commits 和 backup 分支一直在那里，但我们的注意力完全被 IDE Timeline 和 AI 日志这两个"新发现"吸引了。

**每一次 Write 调用都是一份备份，每一次 commit 都是一个快照，每一个被忽略的 branch 可能就是你要找的答案。** 恢复数据时，先穷举已有信息，再寻找新渠道。

---

*如果这篇文章帮到了你，或者你有类似的经历，欢迎分享。灾难恢复的经验，每一条都是用痛苦换来的。*
