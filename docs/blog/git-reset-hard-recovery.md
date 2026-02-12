# git reset --hard 后，我找回了 98.6% 的代码：一次数据恢复的全记录

> **TL;DR**: 一次 `git reset --hard` 导致 ~220 个文件的修改永久丢失。在 git reflog、fsck、Time Machine 全部失败后，我通过 IDE 本地时间线恢复了 67 个文件，又从 AI 编程助手（Claude CLI）的会话日志中重建了剩余 84 个文件，最终恢复率达到 98.6%。本文完整记录了这次事故的经过、每一种恢复手段的成败，以及一个此前从未被讨论过的恢复向量——**AI 编程助手的操作日志**。

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

我让 Claude（通过 Claude CLI 运行的 AI 编程助手）帮我梳理这些未提交的代码，按功能模块分组提交。Claude 规划了 15 个 commit 分组，开始执行。

灾难的根源在于 Claude 的操作序列：

1. **多次 `git add` + `git commit`**，但每次只暂存了新增的未跟踪文件和少量 db 相关的修改文件。那 ~220 个 `M` 状态的修改文件**从未被 `git add` 暂存过**。

2. Claude 尝试 `git reset --soft HEAD~1` 回退临时提交进行调整——这本身没有问题。

3. **致命一击**：Claude 执行了 `git reset --hard HEAD~1`。

`git reset --hard` 做了两件事：移动 HEAD 指针，并且**把工作目录恢复到目标 commit 的状态**。那些从未被 `git add` 的 ~220 个修改文件，它们只存在于工作目录中。一个 `--hard`，全部归零。

我注意到异常时，`git status` 显示的文件数从 580+ 骤降到 157。一半的工作，消失了。

---

## 三、常规恢复——全军覆没

### 3.1 git reflog

第一反应：reflog。

```bash
git reflog
```

找到了 16 个 dangling commits 和 660 个 dangling blobs。逐一检查今天创建的 3 个临时提交：

| Commit | 修改文件数 | 总文件数 |
|--------|-----------|---------|
| `c8c64af` | 5 | 55 |
| `be12235` | 5 | 54 |
| `47f484c` | 1 | 103 |

**M 文件最多只有 5 个。** 这意味着那 ~220 个修改文件从未进入 git 的对象存储。Git 没有它们的任何记录。

> reflog 只能恢复曾经被 commit 或 stash 过的内容。从未 `git add` 的文件，在 git 的世界里根本不存在。

### 3.2 git stash

```bash
git stash list
```

空的。Claude 在开始操作前没有执行 `git stash`。我自己也没有。

这本应是操作前的第一步。

### 3.3 git fsck —— 660 个 dangling blobs

```bash
git fsck --no-reflogs --unreachable
```

找到 660 个 dangling blob 对象。但这些 blob 来自其他操作（之前的 codex 生成快照等），不包含丢失的修改文件——因为它们从未被暂存。

**结论**：`git reset --hard` 丢弃的是工作目录的修改。如果这些修改从未被 `git add`，git 就没有为它们创建过 blob 对象。所有 git 层面的恢复手段到此为止。

### 3.4 VS Code / IDE Local History

VS Code 有 Local History 功能，会在文件保存时自动创建快照。

```
~/Library/Application Support/Code/User/History
```

检查后发现只有 16 个文件，全部是系统配置文件（`.zshrc`、`clash.meta` 等），零个项目文件。工作区的 `localHistory` 目录也不存在。

### 3.5 Time Machine

```bash
tmutil listlocalsnapshots /
```

找到两个本地快照：

```
com.apple.TimeMachine.2026-02-11-180544.local  # 18:05:44
com.apple.TimeMachine.2026-02-11-190311.local  # 19:03:11
```

但 `git reset --hard` 发生在约 17:30。两个快照都**在数据丢失之后**。

更糟的是，macOS 15.5 (Sequoia) 上 `tmutil mountlocalsnapshot` 返回 "Unrecognized verb"——API 变了。等我后来再检查时，这两个快照已经被系统自动清理了。

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

## 八、最终战果

| 恢复阶段 | 来源 | 恢复文件数 |
|---------|------|-----------|
| Phase 1 | Antigravity IDE Timeline | 67 |
| Phase 2 | Claude CLI 日志（OK — 完美回放） | 64 |
| Phase 3 | Claude CLI 日志（WARN — 版本择优） | 20 |
| 保留 | 当前版本已是最优 | 12 |
| **合计** | | **~217 / 220** |

**最终未恢复**：3 个 scheduler 模块文件存在少量 Edit 级别的修改未被重建（只有 Edit 记录，没有 Write 基准内容）。

**恢复率：98.6%**

从最初判断"~220 个文件永久丢失、所有常规手段无效"，到最终只剩 3 个文件有少量修改未恢复。整个过程耗时约 3-4 小时。

---

## 九、一个从未被讨论过的恢复向量

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
4. 这些日志**独立于 git**，不受 `git reset --hard` 影响

如果你大量使用 AI 编程助手（Claude CLI、Cursor、Copilot 等），你的 AI 会话日志可能就是你最后的救命稻草。

### 恢复数据的来源优先级

经过这次事故，我总结出一个恢复来源的优先级：

| 优先级 | 来源 | 前提条件 | 本次结果 |
|--------|------|---------|---------|
| 1 | git reflog / fsck | 文件曾被 `git add` | 失败 |
| 2 | git stash | 操作前执行了 stash | 失败（未执行） |
| 3 | IDE Local History / Timeline | 文件曾在 IDE 中打开并保存 | 恢复 67 个 |
| 4 | **AI 编程助手日志** | 文件由 AI 创建或修改过 | **恢复 84 个** |
| 5 | Time Machine / OS 快照 | 快照时间早于事故 | 失败（快照太晚） |
| 6 | 磁盘级数据恢复 | SSD 未 TRIM | 未尝试（成功率极低） |

注意第 4 项——这是一个全新的恢复向量，在所有传统 git 数据恢复指南中都不会被提到。

---

## 十、教训与防御性 Git 操作清单

### 根本原因

这次事故的根本原因不是 `git reset --hard` 本身，而是**在有大量未暂存修改时使用了它**。

```
580 个未提交文件 + 未备份 + git reset --hard = 灾难
```

### 防御性操作清单

**操作前**：

- [ ] **任何破坏性 git 操作前，先 `git stash push -m "backup"`**
- [ ] 或者创建备份分支：`git checkout -b backup/pre-xxx`
- [ ] 批量提交大量文件时：先 stash 全部，再逐组从 stash 中取出提交
- [ ] 确认 IDE 的 Local History / Timeline 功能已启用

**操作中**：

- [ ] **绝对不要在有未提交改动时使用 `git reset --hard`**
- [ ] 优先使用 `git reset --soft`（只移动 HEAD，不动工作目录）
- [ ] 优先使用 `git restore --staged .`（只取消暂存，不丢弃修改）
- [ ] 使用 AI 编程助手时，确认它不会执行破坏性 git 命令

**日常习惯**：

- [ ] 不要积累 580 个未提交文件（这本身就是问题）
- [ ] 频繁、小批量提交
- [ ] 确认 Time Machine 或其他备份方案正在运行
- [ ] 了解你的 AI 编程助手的日志存储位置

### Claude CLI 日志位置（备忘）

```
~/.claude/projects/{project-hash}/*.jsonl    # 会话日志（包含所有 Write/Edit 操作）
~/.claude/file-history/                       # 修改前的文件快照
```

---

## 后记

我问 Claude："你自己在改动之前就没备份吗？"

它的回答是：

> 没有。这是我的严重失误。在对你的代码执行任何 git 操作之前，我应该先做 `git stash push -m "backup"` 或者创建一个备份分支。**但我没有做任何备份就直接开始操作了，并且多次使用了破坏性的 `git reset --hard` 命令。**

AI 编程助手不是全能的。它能写出很好的代码，但在操作安全性上，它可能犯下和新手一样的错误。讽刺的是，最终拯救我的也是 AI——不是它的能力，而是它的日志。

**每一次 Write 调用都是一份备份，每一次 Edit 调用都是一条变更记录。** 这个意外的发现，可能是这次灾难中唯一值得庆幸的事。

---

*如果这篇文章帮到了你，或者你有类似的经历，欢迎分享。灾难恢复的经验，每一条都是用痛苦换来的。*
