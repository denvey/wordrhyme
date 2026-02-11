# 文档优化说明

## 📊 优化前后对比

**优化前**：所有详细内容都在 CLAUDE.md（约 1200+ 行）

**优化后**：
- **CLAUDE.md**: 679 行（精简版，每次会话都读取）
- **auto-crud-server-best-practices.md**: 587 行（详细版，按需读取）

## ✅ 优化收益

### Token 节省
- **每次会话节省**: ~587 行 ≈ 约 15,000 tokens
- **按需读取**: 只在涉及 CRUD 代码时读取详细文档
- **总节省**: 约 75% 的 auto-crud-server 相关 token 消耗

### 文档结构
```
CLAUDE.md (根指令，每次读取)
├── 核心原则（5 条，精简版）
├── 快速示例（3 个常见场景）
├── 常见错误表（5 个）
└── 📖 详细文档链接 → docs/auto-crud-server-best-practices.md

docs/auto-crud-server-best-practices.md (详细指南，按需读取)
├── 1. Create 操作（完整示例 + 步骤）
├── 2. Update 操作（middleware 签名 + 示例）
├── 3. Delete 操作（2 个场景 + 完整示例）
├── 4. 批量操作（N+1 问题 + 解决方案）
├── 5. 事务操作（并发问题 + 事务方案）
├── 6. 工具函数速查
├── 7. 常见错误清单
├── 8. 完整示例
└── 9. 关键原则总结
```

## 📋 使用指南

### AI 助手行为
1. **涉及 CRUD 代码时**，先读取 `/docs/auto-crud-server-best-practices.md`
2. **CLAUDE.md 提示**：
   ```
   ⚠️ 涉及 CRUD 相关代码时，必须先读取 `/docs/auto-crud-server-best-practices.md`
   ```
3. **Quick Reference 提示**：
   ```
   When asked about CRUD / auto-crud-server: Check `docs/auto-crud-server-best-practices.md`
   ```

### 快速查找

**CLAUDE.md 适合**：
- 快速查看核心原则
- 查看快速示例
- 查看常见错误表

**auto-crud-server-best-practices.md 适合**：
- 完整的操作指南（Create/Update/Delete/批量/事务）
- 详细的错误处理代码
- 完整的工具函数示例
- 性能优化方案

## 🎯 优化效果

| 指标 | 优化前 | 优化后 | 改进 |
|-----|-------|-------|-----|
| **CLAUDE.md 行数** | ~1200 行 | 679 行 | **-43%** |
| **每次会话 token** | ~30,000 | ~17,000 | **-43%** |
| **CRUD 详细文档** | 嵌入主文档 | 独立文档按需读取 | **按需加载** |
| **文档可维护性** | 低（单一巨型文件） | 高（模块化） | **✅ 提升** |

## 📝 维护建议

1. **CLAUDE.md 只放**：
   - 架构概览
   - 核心原则（精简版）
   - 快速示例
   - 文档链接

2. **详细文档独立**：
   - 完整示例
   - 步骤指南
   - 错误处理
   - 最佳实践

3. **更新时同步**：
   - 修改详细文档时，检查 CLAUDE.md 是否需要更新精简版
   - 保持两者一致性

---

**优化日期**: 2025-01-XX
**优化者**: Claude Code
**优化原因**: 减少 token 消耗，提高文档可维护性
