# 开发工作流（双仓库模式）

WordRhyme 采用 **GitLab CE/EE 风格的双仓库模式**，支持在开源核心的基础上开发私有插件（如商业插件、定制插件），同时保持对公开仓库的贡献能力。

| Remote | 仓库 | 可见性 | 用途 |
|--------|------|--------|------|
| `origin` | 你的私有仓库 | 🔒 私有 | 日常开发（含私有插件） |
| `upstream` | [wordrhyme](https://github.com/denvey/wordrhyme) | 🌍 公开 | 开源核心 |

## 初始设置

### 场景 A：从零开始（第一次搭建双仓库）

已 clone 公开仓库 `wordrhyme`，需要新建私有仓库来管理私有插件：

```bash
# 1. 在 GitHub 上创建一个空的私有仓库，不要初始化任何文件

# 2. 在本地已有的 wordrhyme 项目中，重新配置 remote
cd wordrhyme
git remote rename origin upstream          # 公开仓库改名为 upstream
git remote add origin <你的私有仓库地址>     # 添加私有仓库为 origin

# 3. 推送所有分支到私有仓库
git push -u origin --all

# 4. 启用安全防护
git config core.hooksPath .githooks
```

### 场景 B：新环境加入（私有仓库已存在）

直接 clone 私有仓库，再关联公开仓库：

```bash
# 1. 克隆私有仓库（包含所有代码，含私有插件）
git clone <你的私有仓库地址> wordrhyme
cd wordrhyme

# 2. 添加公开仓库作为 upstream
git remote add upstream https://github.com/denvey/wordrhyme.git

# 3. 安装依赖
pnpm install

# 4. 启用安全防护
git config core.hooksPath .githooks
```

## 日常开发（私有插件）

所有日常开发默认推到私有仓库：

```bash
git add .
git commit -m "feat(my-plugin): add product sync"
git push                    # 推到 origin（私有仓库）
```

## 贡献核心代码（开源仓库）

当需要修改 WordRhyme 核心代码并提 PR 到公开仓库时：

```bash
# 1. 基于公开仓库最新代码创建分支
git fetch upstream
git checkout -b fix/improve-plugin-loader upstream/main

# 2. 开发并提交（⚠️ 不要在此分支 commit 私有插件文件）
git add packages/core/src/xxx.ts
git commit -m "feat(core): improve plugin loader"

# 3. 推送到公开仓库并开 PR
git push upstream fix/improve-plugin-loader
# → 去 GitHub wordrhyme 仓库创建 Pull Request
```

## 在私有开发中修复核心 Bug

开发私有插件时发现了核心代码的 bug？修复后用 `cherry-pick` 提取到公开仓库：

```bash
# 1. 在开发分支上，把核心修复单独提一个 commit（不要混入私有代码）
git add packages/core/src/bug-fix.ts
git commit -m "fix(core): fix plugin loader crash"
# commit hash 假设为 abc123

# 2. 创建干净分支，cherry-pick 这个 commit
git fetch upstream
git checkout -b fix/plugin-loader-crash upstream/main
git cherry-pick abc123

# 3. 推送并开 PR
git push upstream fix/plugin-loader-crash
# → GitHub 上创建 PR

# 4. 切回开发分支继续干活
git checkout <你的开发分支>
```

> [!IMPORTANT]
> 核心代码的修复务必**单独一个 commit**，不要和私有插件改动混在一起，否则 cherry-pick 会带上私有代码。

### 同一文件混有公有和私有改动

如果一个文件里同时改了公有代码和私有代码，用 `git add -p` 按代码块选择性提交：

```bash
# 1. 基于 upstream/main 创建干净分支
git fetch upstream
git checkout -b fix/some-bug upstream/main

# 2. 把开发分支上的文件改动拿过来
git checkout <你的开发分支> -- packages/core/src/some-file.ts

# 3. 交互式暂存，只选公有代码部分
git add -p packages/core/src/some-file.ts
#   y → 暂存这块   n → 跳过   s → 再拆分   e → 手动编辑

# 4. 提交并推送
git commit -m "fix(core): fix some bug"
git checkout -- .    # 丢弃未暂存的私有改动
git push upstream fix/some-bug

# 5. 切回开发分支
git checkout <你的开发分支>
```

## 同步公开仓库更新

公开仓库有新的合并（包括你自己的 PR 被合并后），同步到本地：

```bash
git checkout <你的开发分支>
git fetch upstream
git merge upstream/main          # 合并公开仓库最新代码
git push                         # 同步到私有仓库
```

## 新增公开插件

当需要将一个新插件贡献到公开仓库时：

```bash
# 1. 基于公开仓库创建分支
git fetch upstream
git checkout -b feat/add-plugin-xxx upstream/main

# 2. 开发插件
mkdir plugins/my-new-plugin
# ... 正常开发并 commit

# 3. 推送时用 --no-verify 跳过 hook（因为新插件还不在 upstream/main 中）
git push --no-verify upstream feat/add-plugin-xxx
# → GitHub 上创建 PR，合并后该插件自动成为公开插件
```

> [!NOTE]
> 合并进 `upstream/main` 后，hook 会自动识别该插件为公开的，后续推送不再需要 `--no-verify`。

## 安全防护（Pre-push Hook）

项目内置了 `pre-push` 钩子（`.githooks/pre-push`），**自动阻止私有代码被推到公开仓库**。

**零配置**：hook 自动对比 `upstream/main` 中的插件列表，不在其中的插件目录即为私有，无需维护任何配置或标记文件。

首次 clone 后启用：

```bash
git config core.hooksPath .githooks
```

行为：

| 场景 | 频率 | hook 行为 | 操作 |
|------|------|----------|------|
| 日常推到私有仓库 | 每天 | 不检查 | `git push` |
| 核心代码提 PR | 偶尔 | ✅ 检查通过 | `git push upstream xxx` |
| **误推私有插件** | 不应发生 | 🚫 **自动拦截** | 被拦住，安全 |
| **新增公开插件** | 很少 | 🚫 拦截（预期） | `git push --no-verify upstream xxx` |

## 注意事项

> [!CAUTION]
> 推送到 `upstream`（公开仓库）的分支**绝对不能包含私有插件代码**。
> 始终从 `upstream/main` 创建新分支来做核心贡献。

> [!TIP]
> 日常 `git push` 默认推到 `origin`（私有仓库），不会泄露到公开仓库。
> 只有显式 `git push upstream <branch>` 时才会推送到公开仓库。

---

## 故障恢复

### 误推私有代码到公开仓库

如果私有代码已经推到了 `upstream`（比如用了 `--no-verify`）：

**情况 1：还没合并（只是推了分支）** — 直接删掉远程分支即可：

```bash
git push upstream --delete feat/bad-branch
```

**情况 2：已经合并到 main** — 需要 revert：

```bash
git fetch upstream
git checkout -b revert/remove-private-code upstream/main

# 找到包含私有代码的 merge commit
git log --oneline -10

# revert 它
git revert <merge-commit-hash>
git push upstream revert/remove-private-code
# → 立即开 PR 并合并
```

> [!WARNING]
> revert 后代码会从最新版本中移除，但 **Git 历史中仍然可见**。
> 如果泄漏敏感信息（密钥、凭证等），需要联系 GitHub 支持清理历史，或使用 `git filter-branch` / BFG Repo-Cleaner 重写历史。

---

## 合并冲突处理

执行 `git merge upstream/main` 时如果出现冲突：

```bash
git fetch upstream
git merge upstream/main

# 如果有冲突
# 1. 查看冲突文件
git status

# 2. 解决冲突（编辑文件，保留需要的内容）
code <conflicted-file>

# 3. 标记解决并完成合并
git add <resolved-files>
git merge --continue

# 4. 推到私有仓库
git push
```

> [!TIP]
> 冲突通常出现在你的私有分支修改了核心代码、而 upstream 也修改了同一处。
> 建议**频繁同步** `upstream/main`（每周至少一次），减少冲突规模。

---

## 私有插件依赖未合并的核心改动

你改了核心代码让私有插件使用，但 PR 还没合并到 upstream：

**直接在私有分支上开发就行**，不影响任何事：

```bash
# 在开发分支上同时修改核心代码和私有插件
git add packages/core/src/new-api.ts     # 核心改动
git commit -m "feat(core): add new plugin API"

git add plugins/my-plugin/src/use-new-api.ts  # 私有插件使用
git commit -m "feat(my-plugin): use new plugin API"

git push   # 推到私有仓库，正常工作
```

等准备好后，把核心改动的 commit cherry-pick 到公开分支提 PR：

```bash
git fetch upstream
git checkout -b feat/new-plugin-api upstream/main
git cherry-pick <core-commit-hash>
git push upstream feat/new-plugin-api
```

PR 合并后，同步回来：

```bash
git checkout <你的开发分支>
git merge upstream/main   # 核心改动从 upstream 合进来，和你本地的改动会自动合并
git push
```

---

## 版本发布 / 打 Tag

公开仓库和私有仓库**独立打 tag**：

```bash
# 公开仓库发版
git fetch upstream
git checkout upstream/main
git tag v0.2.0
git push upstream v0.2.0

# 私有仓库同步并打标记（可选）
git checkout <你的开发分支>
git merge upstream/main
git tag private-v0.2.0      # 私有仓库用不同前缀区分
git push origin private-v0.2.0
```

> [!NOTE]
> 公开仓库的 tag 代表**核心版本**，私有仓库的 tag 代表**包含私有插件的完整版本**。
> 两者版本号可以不同步。
