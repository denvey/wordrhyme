---
description: "如何正确更新并保留魔改的 shadcn/ui 组件 (How to update a customized shadcn component)"
---

# 更新 Shadcn UI 组件流程

本项目使用了按需分配源码的 shadcn/ui 架构，开发者对 `components/ui` 等目录下的组件拥有**绝对的代码所有权**，并且我们通常会对它们进行业务魔改（例如强制区分 `import type React`、加入内部权限钩子等）。

当你不得不从官方拉取最新版本（如获取新特性或 BUG 修复）时，本地修改和官方更新产生冲突不可避免。请**不要感到畏惧**，严格遵循以下合并流：

1. **工作区化零为整 (Check Clean State)**：
   确保针对当前目标组件的本地修改已经全部被 Commit（或者 Stash）。不要在工作区很乱的时候执行更新命令。

2. **强制覆盖拉取 (Force Fetch Upstream)**：
   执行官方命令并使用 `--overwrite` 标签，勇敢覆盖本地文件。
   ```bash
   npx shadcn@latest add [component-name] --overwrite
   ```

3. **利用 Git Diff 精准夺回资产 (Cherry-pick via Diff)**：
   - 打开 Git 版本比对（Source Control / Diff 视图）。
   - 保留官方的 DOM 结构/库逻辑修复。
   - 使用丢弃局部更改（revert selected ranges）的编辑方式，将你曾经写的**专属魔改（Type-Only Imports、上下文包裹等）手动恢复**过来。

4. **一键治愈（Auto Fix via Linter）**：
   合并完成后，**禁止手动排版**！只需立刻对该组件文件执行自动格式化（保存触发或运行命令行）：
   ```bash
   eslint --fix apps/xxx/src/components/ui/xxx.tsx
   ```
   Linter 会瞬间纠正官方带来的一切不合规语法或类型导入混用的恶习，组件光复完毕。
