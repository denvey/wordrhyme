# LBAC Teams Plugin

团队层级访问控制插件。

## 功能

- **团队层级**：支持无限层级团队结构（基于 PostgreSQL ltree）
- **KeyProvider**：注入用户所属团队的 keys（含父级团队）
- **MemberProvider**：授权给团队时自动展开到成员
- **Better-Auth 集成**：扩展 Better-Auth 组织插件

## 安装

```bash
wordrhyme plugin install com.wordrhyme.lbac-teams
```

## 数据库

插件自带迁移，创建以下表：

| 表 | 说明 |
|---|---|
| `team` | 团队表（含 parent_id, path, level 层级字段） |
| `team_member` | 团队成员表 |

## 使用

安装后自动生效，用户的 `userKeys` 会包含团队信息：

```
['user:u1', 'org:o1', 'team:engineering', 'team:backend', ...]
```

### 创建团队

```typescript
await db.insert(team).values({
  id: 'team-backend',
  name: 'Backend Team',
  organizationId: orgId,
  parentId: 'team-engineering',  // 父团队
  path: 'team-engineering.team-backend',  // ltree 路径
  level: 1,
});
```

### 添加成员

```typescript
await db.insert(teamMember).values({
  id: generateId(),
  teamId: 'team-backend',
  userId: 'user-123',
  role: 'member',
});

// 通知继承服务重新计算
await inheritanceService.onScopeMembershipChanged('team', 'team-backend');
```

### 授权给团队

```typescript
await ownershipInheritanceService.grantWithInheritance(
  'article', 'a1', 'team', 'team-backend', 'read'
);
// 自动展开到所有团队成员
```

## 层级查询

```sql
-- 查询某团队的所有子团队
SELECT * FROM team WHERE path::ltree <@ 'team-engineering'::ltree;

-- 查询某团队的所有父团队
SELECT * FROM team WHERE path::ltree @> 'team-engineering.team-backend'::ltree;
```

## Better-Auth 配置

插件提供 Better-Auth 扩展配置：

```typescript
// 在 auth 配置中启用
import { teamPlugin } from '@wordrhyme/plugin-lbac-teams/auth';

export const auth = betterAuth({
  plugins: [
    organization(),
    teamPlugin(),  // 启用团队支持
  ],
});
```
