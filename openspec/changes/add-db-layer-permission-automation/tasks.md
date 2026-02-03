## 1. Foundation & Infrastructure ✅ (Completed)

- [x] 1.1 扩展 `RequestContext` 类型定义
  - [x] 1.1.1 在 `async-local-storage.ts` 中添加 `permissionMeta?: { action: string; subject: string }` 字段
  - [x] 1.1.2 更新 TypeScript 类型导出

- [x] 1.2 实现 `PermissionCache` (Redis 缓存层)
  - [x] 1.2.1 创建 `permission-cache.ts` 文件
  - [x] 1.2.2 实现 `get(orgId, roles)` 方法
  - [x] 1.2.3 实现 `set(orgId, roles, rules)` 方法(TTL=300秒)
  - [x] 1.2.4 实现 `invalidateOrganization(orgId)` 方法
  - [x] 1.2.5 添加错误处理(Redis 故障降级到 DB)
  - [x] 1.2.6 在 NestJS 中注册为 Injectable

- [x] 1.3 增强 `PermissionKernel`
  - [x] 1.3.1 注入 `PermissionCache` 依赖
  - [x] 1.3.2 修改 `getAbility()` 实现三层缓存逻辑
  - [x] 1.3.3 实现 `permittedFields(action, subject, ctx)` 方法
  - [x] 1.3.4 在 `can()` 方法中添加 `skipAudit` 标志支持
  - [x] 1.3.5 修改 `writeAuditLog()` 使用 `rawDb`(避免递归)
  - [x] 1.3.6 添加缓存命中/未命中的 debug 日志

- [x] 1.4 导出 `rawDb`
  - [x] 1.4.1 在 `db/client.ts` 或 `db/index.ts` 中导出原始 Drizzle 实例 ✅ (已存在)
  - [x] 1.4.2 添加 JSDoc 说明:仅用于系统内部(审计日志、权限检查)

## 2. tRPC Integration ✅ (Completed)

- [x] 2.1 定义 `PermissionMeta` 类型
  - [x] 2.1.1 在 `trpc/trpc.ts` 中添加类型定义
  - [x] 2.1.2 扩展现有 `Meta` 类型(与 `AuditMeta` 合并)

- [x] 2.2 实现 `globalPermissionMiddleware`
  - [x] 2.2.1 检查 `meta?.permission` 是否存在
  - [x] 2.2.2 执行 RBAC 检查(`permissionKernel.require(action, subject)`)
  - [x] 2.2.3 将 `permissionMeta` 存入 AsyncLocalStorage
  - [x] 2.2.4 添加 DEBUG 日志输出

- [x] 2.3 将中间件添加到 `protectedProcedure`
  - [x] 2.3.1 确保执行顺序:认证 → 审计 → 权限
  - [x] 2.3.2 更新 JSDoc 示例代码

## 3. ScopedDb Enhancement (Core) ✅ (Completed)

- [x] 3.1 准备工作
  - [x] 3.1.1 添加 `DEBUG_PERMISSION` 环境变量检查
  - [x] 3.1.2 实现 `debugLog(message, data?)` 工具函数
  - [x] 3.1.3 实现 `getPermissionMeta()` 辅助函数(从 AsyncLocalStorage 读取)

- [x] 3.2 实现 `autoFilterFields<T>()` 函数
  - [x] 3.2.1 调用 `permissionKernel.permittedFields(action, subject, ctx)`
  - [x] 3.2.2 实现 `filterObject(obj, allowedFields)` 辅助函数
  - [x] 3.2.3 支持单个对象和数组过滤
  - [x] 3.2.4 添加过滤前后字段对比的 DEBUG 日志

- [x] 3.3 增强 SELECT 操作
  - [x] 3.3.1 在 `wrapExecute()` 中添加权限字段过滤
  - [x] 3.3.2 在 `wrapFindMethod()` 中添加权限字段过滤
  - [x] 3.3.3 查询后自动调用 `autoFilterFields()`
  - [x] 3.3.4 无 `permissionMeta` 时直接透传(兼容性)

- [x] 3.4 增强 UPDATE 操作
  - [x] 3.4.1 实现 `checkAbacForInstances()` 辅助函数
  - [x] 3.4.2 实现 `filterUpdateValues()` 字段过滤函数
  - [x] 3.4.3 使用 `rawDb` 查询待更新的资源实例
  - [x] 3.4.4 遍历实例,执行 ABAC 检查(`permissionKernel.can` with `skipAudit: true`)
  - [x] 3.4.5 字段过滤 `updateValues`
  - [x] 3.4.6 使用 `rawDb` 重建查询执行最终更新(避免递归)
  - [x] 3.4.7 添加 DEBUG 日志
  - [x] 3.4.8 支持 `.returning()` 路径

- [x] 3.5 增强 DELETE 操作
  - [x] 3.5.1 在 `wrapUpdateDeleteWhere()` 中添加 ABAC 检查
  - [x] 3.5.2 劫持 `execute()` 方法
  - [x] 3.5.3 使用 `rawDb` 查询待删除的资源实例
  - [x] 3.5.4 遍历实例,执行 ABAC 检查(`skipAudit: true`)
  - [x] 3.5.5 使用 `rawDb` 执行最终删除
  - [x] 3.5.6 添加 DEBUG 日志
  - [x] 3.5.7 支持 `.returning()` 路径

- [x] 3.6 完成集成
  - [x] 3.6.1 修改 `wrapUpdate()` 传递 `table` 参数
  - [x] 3.6.2 修改 `wrapDelete()` 传递 `table` 参数
  - [x] 3.6.3 修改 `wrapUpdateDeleteWhere()` 签名添加 `table` 参数
  - [x] 3.6.4 实现 `getPrimaryKeyColumn()` 辅助函数
  - [x] 3.6.5 向后兼容:无 `permissionMeta` 时仅执行 LBAC

## 4. Performance Optimization (SQL Pushdown) ✅ (Completed)

- [x] 4.1 创建 `casl-to-sql.ts` 文件
  - [x] 4.1.1 实现 `resolveTemplateValue(value, userContext)` 函数(解析 `${user.id}`)
  - [x] 4.1.2 实现 `getNestedValue(obj, path)` 辅助函数
  - [x] 4.1.3 实现 MongoDB operator 转换(`$eq`, `$ne`, `$in`, `$nin`, `$gt`, `$gte`, `$lt`, `$lte`, `$exists`)
  - [x] 4.1.4 实现 `conditionsToSQL(conditions, table, userContext)` 主函数

- [x] 4.2 集成 SQL 优化到 UPDATE/DELETE
  - [x] 4.2.1 在 `wrapUpdateDeleteWhere` 的 execute() 中获取 CASL conditions
  - [x] 4.2.2 调用 `conditionsToSQL()` 尝试转换
  - [x] 4.2.3 成功时:使用 `and(finalCondition, conversionResult.sql)` 单查询路径
  - [x] 4.2.4 失败时:Fallback 到双查询路径
  - [x] 4.2.5 添加 DEBUG 日志标识使用的路径("✅ SQL optimization enabled" / "❌ SQL optimization failed")
  - [x] 4.2.6 同时支持 .execute() 和 .returning().execute() 路径

- [ ] 4.3 性能监控埋点
  - [ ] 4.3.1 记录权限检查耗时(缓存命中 vs DB)
  - [ ] 4.3.2 记录 SQL 优化命中率
  - [ ] 4.3.3 可选:集成到 APM/Prometheus

## 5. Cache Invalidation ✅ (Completed)

- [x] 5.1 在权限管理 Router 中集成缓存失效
  - [x] 5.1.1 找到 `updateRolePermissions` mutation (实际为 `assignPermissions`)
  - [x] 5.1.2 在事务成功后调用 `permissionCache.invalidateOrganization(orgId)`
  - [x] 5.1.3 找到 `assignUserRole` mutation (未找到独立接口,可能在用户管理中)
  - [x] 5.1.4 同样添加缓存失效逻辑 (已在 assignPermissions 中实现)

- [x] 5.2 添加手动缓存刷新接口(可选)
  - [x] 5.2.1 创建 `admin.clearPermissionCache` mutation (实际为 `permissions.clearCache`)
  - [x] 5.2.2 权限要求:`manage:Permission` (实际为 `organization:manage`)
  - [x] 5.2.3 调用 `permissionCache.invalidateOrganization()`(危险操作,已记录日志)

## 6. Migration & Testing

- [x] 6.1 创建迁移文档 ✅
  - [x] 6.1.1 编写 `docs/migration/db-permission-automation.md`
  - [x] 6.1.2 列出所有受影响的 handlers (settings.ts, permissions.ts 使用旧模式)
  - [x] 6.1.3 提供迁移前后对比示例 (3个完整示例: UPDATE, DELETE, SELECT)

- [ ] 6.2 批量迁移 tRPC handlers
  - [ ] 6.2.1 扫描所有 `*.router.ts` 文件
  - [ ] 6.2.2 识别包含手动权限检查的 procedures
  - [ ] 6.2.3 添加 `.meta()` 配置
  - [ ] 6.2.4 移除手动权限代码(`permissionKernel.require`, `permittedFields` 调用)
  - [ ] 6.2.5 简化查询逻辑(移除双查询)

- [ ] 6.3 单元测试
  - [ ] 6.3.1 测试 `PermissionCache` 的 get/set/invalidate
  - [ ] 6.3.2 测试 `autoFilterFields` 字段过滤逻辑
  - [ ] 6.3.3 测试 `conditionsToSQL` 各种 MongoDB operators
  - [ ] 6.3.4 测试 `resolveTemplateValue` 模板解析

- [ ] 6.4 集成测试
  - [ ] 6.4.1 测试完整流程:tRPC meta → 中间件 → ScopedDb → 权限检查
  - [ ] 6.4.2 测试字段过滤生效(SELECT 缺少未授权字段)
  - [ ] 6.4.3 测试 ABAC 拒绝(UPDATE 非自己的资源)
  - [ ] 6.4.4 测试 SQL 优化路径(单查询 vs 双查询)
  - [ ] 6.4.5 测试缓存失效(修改权限后立即生效)
  - [ ] 6.4.6 测试 Redis 故障降级(关闭 Redis 仍能工作)

- [ ] 6.5 性能测试
  - [ ] 6.5.1 Benchmark:权限检查延迟(冷启动 vs 热缓存)
  - [ ] 6.5.2 Benchmark:UPDATE 双查询 vs SQL 优化单查询
  - [ ] 6.5.3 压力测试:100 并发请求下的缓存命中率
  - [ ] 6.5.4 验证目标:P50 < 3ms, P99 < 15ms, 缓存命中率 > 95%

## 7. Documentation & Deployment

- [ ] 7.1 更新开发文档
  - [ ] 7.1.1 在 `docs/PERMISSION_SYSTEM.md` 中添加自动化使用指南
  - [ ] 7.1.2 更新代码示例(Before/After)
  - [ ] 7.1.3 添加调试指南(`DEBUG_PERMISSION=true`)
  - [ ] 7.1.4 添加性能优化建议(何时 SQL 优化生效)

- [ ] 7.2 添加配置文档
  - [ ] 7.2.1 文档化 `PERMISSION_CACHE_TTL` 环境变量
  - [ ] 7.2.2 文档化 `DEBUG_PERMISSION` 环境变量
  - [ ] 7.2.3 提供不同场景的推荐配置(高安全 vs 高性能)

- [ ] 7.3 部署准备
  - [ ] 7.3.1 确认 Redis 配置可用
  - [ ] 7.3.2 设置 `PERMISSION_CACHE_TTL=300`(生产环境)
  - [ ] 7.3.3 设置监控告警(缓存失效率、权限拒绝率)
  - [ ] 7.3.4 准备回滚方案(移除 `.meta()` 配置的脚本)

- [ ] 7.4 灰度发布
  - [ ] 7.4.1 选择 1-2 个低风险接口先行部署
  - [ ] 7.4.2 监控 24 小时(错误率、性能指标)
  - [ ] 7.4.3 确认无问题后全量部署
  - [ ] 7.4.4 持续监控 1 周,收集反馈

## 8. Post-Deployment

- [ ] 8.1 监控指标
  - [ ] 8.1.1 每日检查缓存命中率(预期 95%+)
  - [ ] 8.1.2 每日检查 P99 延迟(预期 < 15ms)
  - [ ] 8.1.3 检查权限拒绝率(确认无误拒)

- [ ] 8.2 优化调整
  - [ ] 8.2.1 根据监控数据调整缓存 TTL
  - [ ] 8.2.2 优化复杂 CASL conditions 的 SQL 转换逻辑
  - [ ] 8.2.3 添加更多 MongoDB operators 支持(如需要)

- [ ] 8.3 清理旧代码
  - [ ] 8.3.1 移除所有旧的手动权限检查辅助函数
  - [ ] 8.3.2 移除废弃的文档/注释
  - [ ] 8.3.3 更新代码审查 Checklist(强制使用 `.meta()`)
