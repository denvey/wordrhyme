#!/bin/bash

echo "🔍 验证迁移完整性..."
echo ""

# 检查是否还有 tenantId 字段引用(排除注释和变量名)
echo "1️⃣ 检查数据库字段引用..."
FIELD_REFS=$(grep -r "\.(tenantId)" src --include="*.ts" | \
  grep -E "(notifications|assets|files|menus|billing|audit|feature|scheduled|webhook|settings|roles|plugins)" | \
  grep -v "organizationId" | \
  grep -v "// " | \
  grep -v "/\*" | \
  wc -l | tr -d ' ')

if [ "$FIELD_REFS" -eq "0" ]; then
    echo "   ✅ 没有遗漏的字段引用"
else
    echo "   ⚠️  发现 $FIELD_REFS 处可能的遗漏:"
    grep -r "\.(tenantId)" src --include="*.ts" | \
      grep -E "(notifications|assets|files|menus|billing|audit|feature|scheduled|webhook|settings|roles|plugins)" | \
      grep -v "organizationId" | \
      head -10
fi
echo ""

# 检查 Context 类型
echo "2️⃣ 检查 Context 类型定义..."
if grep -q "tenantId.*:" src/context/async-local-storage.ts; then
    echo "   ⚠️  Context 中还有 tenantId 定义"
else
    echo "   ✅ Context 已更新为 organizationId"
fi
echo ""

# 检查 Schema 定义
echo "3️⃣ 检查 Schema 定义..."
SCHEMA_REFS=$(grep -r "tenantId.*text.*tenant_id" src/db/schema/*.ts | wc -l | tr -d ' ')
if [ "$SCHEMA_REFS" -eq "0" ]; then
    echo "   ✅ 所有 Schema 已更新"
else
    echo "   ⚠️  发现 $SCHEMA_REFS 个 Schema 未更新"
fi
echo ""

# 统计
echo "📊 迁移统计:"
ORG_ID_COUNT=$(grep -r "organizationId.*text.*organization_id" src/db/schema/*.ts | wc -l | tr -d ' ')
echo "   - Schema 中的 organizationId 字段: $ORG_ID_COUNT"

CODE_ORG_ID=$(grep -r "\.organizationId" src --include="*.ts" | wc -l | tr -d ' ')
echo "   - 代码中的 .organizationId 引用: $CODE_ORG_ID"
echo ""

# 最终结果
if [ "$FIELD_REFS" -eq "0" ] && [ "$SCHEMA_REFS" -eq "0" ]; then
    echo "✅ 迁移验证通过!"
    echo ""
    echo "可以启动服务器了:"
    echo "  pnpm --filter @wordrhyme/server dev"
    exit 0
else
    echo "⚠️  发现问题,请检查上述输出"
    exit 1
fi
