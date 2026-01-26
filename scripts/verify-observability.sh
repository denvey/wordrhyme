#!/bin/bash

# Observability System Verification Script
# 验证所有核心功能是否正常工作

set -e

echo "🔍 Observability System Verification"
echo "======================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试结果计数
PASSED=0
FAILED=0

# 辅助函数
check_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    ((FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
}

# 1. 检查插件目录
echo "1️⃣  Checking Plugin Directory"
echo "------------------------------"

if [ -d "plugins/logger-pino" ]; then
    check_pass "logger-pino plugin directory exists"

    if [ -f "plugins/logger-pino/manifest.json" ]; then
        check_pass "logger-pino manifest.json exists"
    else
        check_fail "logger-pino manifest.json not found"
    fi

    if [ -f "plugins/logger-pino/dist/index.js" ]; then
        check_pass "logger-pino compiled (dist/index.js exists)"
    else
        check_warn "logger-pino not compiled yet (run 'pnpm --filter logger-pino build')"
    fi
else
    check_fail "logger-pino plugin directory not found"
fi

if [ -d "plugins/example-observability" ]; then
    check_pass "example-observability plugin exists"
else
    check_warn "example-observability plugin not found (optional)"
fi

echo ""

# 2. 检查核心文件
echo "2️⃣  Checking Core Observability Files"
echo "-------------------------------------"

CORE_FILES=(
    "apps/server/src/observability/observability.module.ts"
    "apps/server/src/observability/logger.service.ts"
    "apps/server/src/observability/trace.service.ts"
    "apps/server/src/observability/metrics.service.ts"
    "apps/server/src/observability/error-tracker.service.ts"
    "apps/server/src/observability/plugin-health-monitor.ts"
)

for file in "${CORE_FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$(basename $file)"
    else
        check_fail "$(basename $file) not found"
    fi
done

echo ""

# 3. 检查插件集成
echo "3️⃣  Checking Plugin Integration"
echo "-------------------------------"

if grep -q "setLoggerService" "apps/server/src/plugins/plugin-manager.ts"; then
    check_pass "PluginManager has setLoggerService()"
else
    check_fail "PluginManager missing setLoggerService()"
fi

if grep -q "loadLoggerAdapter" "apps/server/src/plugins/plugin-manager.ts"; then
    check_pass "PluginManager has loadLoggerAdapter()"
else
    check_fail "PluginManager missing loadLoggerAdapter()"
fi

if grep -q "LoggerService" "apps/server/src/plugins/plugin.module.ts"; then
    check_pass "PluginModule imports LoggerService"
else
    check_fail "PluginModule doesn't import LoggerService"
fi

echo ""

# 4. 检查 Manifest Schema
echo "4️⃣  Checking Manifest Schema"
echo "----------------------------"

if grep -q "provides.*array" "packages/plugin/src/manifest.ts"; then
    check_pass "capabilities.provides field added to schema"
else
    check_fail "capabilities.provides field missing in schema"
fi

if grep -q "loggerAdapter" "packages/plugin/src/manifest.ts"; then
    check_pass "exports.loggerAdapter field added to schema"
else
    check_fail "exports.loggerAdapter field missing in schema"
fi

echo ""

# 5. 检查 Fastify Request ID
echo "5️⃣  Checking Fastify Request ID Integration"
echo "-------------------------------------------"

if grep -q "requestIdHeader" "apps/server/src/main.ts"; then
    check_pass "Fastify requestIdHeader configured"
else
    check_fail "Fastify requestIdHeader not configured"
fi

if grep -q "x-request-id" "apps/server/src/main.ts"; then
    check_pass "x-request-id header integration"
else
    check_fail "x-request-id header missing"
fi

echo ""

# 6. 检查文档
echo "6️⃣  Checking Documentation"
echo "-------------------------"

DOC_FILES=(
    "docs/LOGGER_ADAPTER_PLUGIN.md"
    "docs/OBSERVABILITY_QUICK_START.md"
    "openspec/changes/add-core-observability-system/IMPLEMENTATION_SUMMARY.md"
)

for doc in "${DOC_FILES[@]}"; do
    if [ -f "$doc" ]; then
        check_pass "$(basename $doc)"
    else
        check_fail "$(basename $doc) not found"
    fi
done

echo ""

# 7. 检查测试文件
echo "7️⃣  Checking Test Files"
echo "----------------------"

if [ -f "apps/server/src/__tests__/observability/logger-adapter.integration.test.ts" ]; then
    check_pass "Logger adapter integration tests exist"
else
    check_warn "Logger adapter integration tests not found (recommended to add)"
fi

echo ""

# 8. 编译检查
echo "8️⃣  Checking Build Status"
echo "------------------------"

if [ -d "apps/server/dist" ]; then
    check_pass "Server compiled (dist directory exists)"
else
    check_warn "Server not compiled yet"
fi

if [ -d "packages/plugin/dist" ]; then
    check_pass "Plugin package compiled"
else
    check_warn "Plugin package not compiled yet"
fi

echo ""

# 9. 环境变量检查
echo "9️⃣  Checking Environment Configuration"
echo "--------------------------------------"

if [ -f ".env" ]; then
    check_pass ".env file exists"

    if grep -q "LOG_LEVEL" ".env"; then
        check_pass "LOG_LEVEL configured"
    else
        check_warn "LOG_LEVEL not configured (will use default)"
    fi
else
    check_warn ".env file not found (using defaults)"
fi

echo ""

# 总结
echo "======================================"
echo "📊 Verification Summary"
echo "======================================"
echo -e "Passed: ${GREEN}${PASSED}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All core checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Build the logger-pino plugin: pnpm --filter logger-pino build"
    echo "2. Start the development server: pnpm --filter @wordrhyme/server dev"
    echo "3. Check logs for 'Logger adapter switched' message"
    echo "4. Access metrics: curl http://localhost:3000/metrics"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some checks failed. Please review the errors above.${NC}"
    echo ""
    exit 1
fi
