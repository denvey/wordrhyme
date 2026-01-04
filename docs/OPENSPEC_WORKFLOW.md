# OpenSpec 工作流指南

本指南说明如何使用 OpenSpec 进行规范驱动开发 (Spec-First Development)。

## 核心原则

1. **Spec-First** - 先写设计文档，批准后再开发
2. **迭代更新** - 讨论中的决策必须同步到文档
3. **Code Review** - 代码必须符合 spec 要求

---

## 工作流程概览

```
思路 → /openspec-proposal → 讨论 → 修改 → 批准 → /openspec-apply → 归档
         (设计阶段)           ↑_____↓        ↓      (开发阶段)
                              迭代修改       ↓
                                      openspec archive
```

---

## 1. 创建 Proposal (`/openspec-proposal`)

### 触发时机

- 有新功能需求
- 需要架构变更
- 需要跨模块修改

### 使用方法

```
/openspec-proposal 添加用户头像上传功能
```

### AI 执行步骤

1. 检查现有 specs 和代码
2. 创建 `openspec/changes/<change-id>/` 目录
3. 编写以下文件：
   - `proposal.md` - 为什么做（背景、目标）
   - `design.md` - 怎么做（技术方案、决策）
   - `tasks.md` - 做什么（任务清单）
   - `specs/<capability>/spec.md` - 详细需求

4. 运行验证：`openspec validate <id> --strict`

### ⚠️ 关键规则

- **不写任何代码**，只产出设计文档
- 每个需求必须有 `#### Scenario:` 验收场景

---

## 2. 讨论与修改 Proposal

### 查看 Proposal

```bash
# 查看概览
openspec show add-avatar-upload

# 查看详情（JSON）
openspec show add-avatar-upload --json --deltas-only
```

### 修改方式

**方式 A：直接指定修改**

```
更新 add-avatar-upload 的 design.md，把存储方案改成 OSS
```

**方式 B：批量反馈修改**

```
修改 add-avatar-upload proposal：
1. 文件大小限制改为 5MB
2. 添加图片压缩步骤
3. 去掉 WebP 支持
```

**方式 C：讨论后确认更新**

```
你: size 限制还是太大了吧
AI: 建议改为 2MB，理由是...
你: 同意，更新到 proposal
AI: (修改 design.md 和 spec.md)
```

### 验证更新

```bash
openspec validate add-avatar-upload --strict
```

---

## 3. 批准后开发 (`/openspec-apply`)

### 触发时机

- Proposal 已被批准
- 所有讨论已同步到文档

### 使用方法

```
/openspec-apply add-avatar-upload
```

### AI 执行步骤

1. 读取 proposal, design, tasks
2. 按顺序完成 tasks.md 中的任务
3. 写代码、运行测试
4. 更新 tasks.md 勾选完成项 `[x]`
5. 保持代码符合 spec

### ⚠️ 关键规则

- 代码必须符合 spec 中的需求
- 发现设计问题应**暂停开发**，先更新 proposal

---

## 4. Code Review - 检查代码符合 Spec

### 方法 A：查询 Spec 需求

```bash
# 查看所有需求
rg -n "Requirement:|Scenario:" openspec/specs

# 查看特定功能的 spec
openspec show permission-kernel --type spec
```

### 方法 B：在对话中请求检查

```
检查 apps/server/src/permission/ 是否符合 openspec/specs/permission-kernel/spec.md
```

### 方法 C：归档时自动验证

```bash
openspec archive add-my-feature
# 会检查 specs 格式、tasks 完成度
```

---

## 5. 会话结束同步决策

### 问题

对话中讨论的决策可能没有写入 spec，导致后续开发不一致

### 解决方案

会话结束前明确要求：

```
把本次讨论的以下决策同步到 design.md：
1. 表名前缀使用 plugin_{id}_
2. 迁移每次启动检查
3. NestJS 模块使用 LazyModuleLoader 加载
```

---

## 6. 归档 (`openspec archive`)

### 触发时机

- 所有任务完成
- 代码已通过测试

### 使用方法

```bash
openspec archive add-avatar-upload
```

### 归档结果

- Proposal 移至 `openspec/archived/`
- Spec 变更合并到 `openspec/specs/`
- 保留完整历史记录

---

## 常用命令速查

| 命令 | 说明 |
|------|------|
| `openspec list` | 查看所有 changes |
| `openspec list --specs` | 查看所有 specs |
| `openspec show <id>` | 查看 change 详情 |
| `openspec show <spec> --type spec` | 查看 spec 详情 |
| `openspec validate <id>` | 验证 change |
| `openspec archive <id>` | 归档完成的 change |

---

## 阶段限制

| 阶段 | 可以做 | 不能做 |
|------|--------|--------|
| **Proposal (设计)** | 修改设计文档、讨论方案 | 写代码 |
| **Apply (开发)** | 写代码、标记任务完成 | 大改设计 |
| **Archive (归档)** | 合并 spec、清理文件 | 继续开发 |

---

## 示例完整流程

```bash
# 1. 创建 proposal
/openspec-proposal 实现用户头像上传

# 2. 查看生成的方案
openspec show add-avatar-upload

# 3. 讨论修改（在对话中）
"存储方案改成 OSS"
"文件大小限制 2MB"

# 4. 验证
openspec validate add-avatar-upload --strict

# 5. 批准后开发
/openspec-apply add-avatar-upload

# 6. 检查进度
openspec list

# 7. 完成后归档
openspec archive add-avatar-upload
```

---

## 最佳实践

1. **每个功能一个 Change** - 保持范围小而聚焦
2. **先 Spec 后 Code** - 避免边开发边设计
3. **及时同步** - 讨论的决策立即更新到文档
4. **验证优先** - 每次修改后运行 `validate`
5. **小步迭代** - tasks.md 拆分为小任务，频繁提交
