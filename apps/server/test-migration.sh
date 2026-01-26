#!/bin/bash

echo "🧪 Testing server after migration..."
echo ""

# Start server in background
echo "▶️  Starting server..."
cd /Users/denvey/Workspace/Coding/Personal/wordrhyme
pnpm --filter @wordrhyme/server dev > /tmp/server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 10

# Check if server is running
if ps -p $SERVER_PID > /dev/null; then
    echo "✅ Server is running (PID: $SERVER_PID)"
    echo ""

    # Check logs for errors
    echo "📋 Checking logs for errors..."
    if grep -i "error" /tmp/server.log | grep -v "0 errors" | head -5; then
        echo "⚠️  Found errors in logs"
    else
        echo "✅ No errors found"
    fi
    echo ""

    # Test health endpoint
    echo "🏥 Testing health endpoint..."
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ Health endpoint responding"
    else
        echo "⚠️  Health endpoint not responding"
    fi
    echo ""

    # Show last 20 lines of log
    echo "📄 Last 20 lines of server log:"
    echo "================================"
    tail -20 /tmp/server.log
    echo "================================"
    echo ""

    # Stop server
    echo "🛑 Stopping server..."
    kill $SERVER_PID
    wait $SERVER_PID 2>/dev/null
    echo "✅ Server stopped"
else
    echo "❌ Server failed to start"
    echo ""
    echo "📄 Server log:"
    echo "================================"
    cat /tmp/server.log
    echo "================================"
    exit 1
fi

echo ""
echo "🎉 Migration verification complete!"
