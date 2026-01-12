#!/bin/bash
# Audit System API 测试脚本

BASE_URL="http://localhost:3000"

echo "=== 测试 Audit System API ==="
echo ""

# 1. 测试统计接口
echo "1. 测试 audit.stats..."
curl -s "$BASE_URL/trpc/audit.stats" | jq '.' || echo "需要登录"
echo ""

# 2. 测试列表接口
echo "2. 测试 audit.list..."
curl -s "$BASE_URL/trpc/audit.list?input=%7B%22page%22:1,%22pageSize%22:10%7D" | jq '.' || echo "需要登录"
echo ""

# 3. 测试实体类型列表
echo "3. 测试 audit.entityTypes..."
curl -s "$BASE_URL/trpc/audit.entityTypes" | jq '.' || echo "需要登录"
echo ""

# 4. 测试操作列表
echo "4. 测试 audit.actions..."
curl -s "$BASE_URL/trpc/audit.actions" | jq '.' || echo "需要登录"
echo ""

echo "=== 测试完成 ==="
echo "注意：需要先登录才能访问 audit API"
