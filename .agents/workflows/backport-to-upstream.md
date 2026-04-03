---
description: 把对框架代码的修复从私有库(OmniDS)干净、安全地“反哺”提交到开源上游库(wordrhyme)
---

# 跨维度反哺：安全提交到 Upstream 开源库

本工作流旨在解决 OmniDS（受污染的下游私有分支）与 Wordrhyme（纯净上游开源分支）之间的代码反哺问题，绝对禁止直接使用私有分支向上游发 PR 的行为，强行阻止“221文件”式的代码倾泄！

## 核心原则 (AI 执行必读)
1. **绝对禁止**：严禁以任何借口将用户当前的 `feature/*` 或 `fix/*` 业务分支直接 `push` 到 `upstream` 远端！
2. **使用孤立基座**：向 `upstream` 提交代码的唯一方式是切出一个基于 `upstream/main` 的无菌临时分支。
3. **单点吸入**：只能通过 `git cherry-pick <hash>` 摘取具体想要回退给开源的通用代码。
4. **锁文件自动重建**：当 `cherry-pick` 报 lockfile 冲突时，不要试图手动去解决，一律执行 `pnpm i --no-frozen-lockfile` 利用基座状态重新生成。

## 工作流自动执行步骤

1. 获知用户想要提交到上游库的那一条 Commit ID `<Target-Hash>` 或功能主题名。
2. 拉取开源库最新同步状态：
// turbo
git fetch upstream main
3. 切出全新的纯净 PR 分支：
// turbo
git checkout -b <Your-Initials>/backport-<feature-name> upstream/main
4. 强行跨空摘取目标修复：
// turbo
git cherry-pick <Target-Hash>
5. （条件分支）如果发生严重依赖冲突，执行自动重组并继续：
// turbo
git checkout HEAD -- pnpm-lock.yaml && pnpm install --no-frozen-lockfile && git add pnpm-lock.yaml && GIT_EDITOR=true git cherry-pick --continue
6. 把这个纯净防侧漏的孤立分支推给远端开源：
// turbo
git push upstream HEAD:<Your-Initials>/backport-<feature-name>
7. 输出可以一键点击发 PR 的 GitHub 链接给用户。
8. 善后处理，切回用户本来的业务分支：
// turbo
git checkout -
