#!/bin/bash

echo "🧪 Testing Hybrid Storage (Memory + Redis)"
echo "=========================================="
echo

# Test without Redis
echo "1. Testing WITHOUT Redis (memory-only):"
curl -s http://localhost:8000/api/stats | grep -o '"redisConnected":[^,]*' | head -1
echo

# Create test clip
echo "2. Creating a test clip..."
RESPONSE=$(curl -s -X POST http://localhost:8000/api/clip \
  -H "Content-Type: application/json" \
  -d '{"content": "Hybrid storage test clip", "expirationMinutes": 60}')

TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
echo "Token: $TOKEN"
echo

# Get current stats
echo "3. Current storage stats:"
curl -s http://localhost:8000/api/stats | python3 -m json.tool 2>/dev/null || curl -s http://localhost:8000/api/stats
echo
echo

echo "🔧 To enable Redis persistence:"
echo "1. Sign up for free at https://upstash.com/"
echo "2. Create a Redis database"
echo "3. Copy the UPSTASH_REDIS_URL"
echo "4. Add to .env file: UPSTASH_REDIS_URL=rediss://your-url"
echo "5. Restart the server"
echo
echo "✅ Benefits with Redis:"
echo "- Data survives server restarts"
echo "- Can scale across multiple servers"
echo "- Automatic TTL (time-to-live) expiration"
echo "- Still lightning fast with memory-first approach"
echo
echo "💡 The API works perfectly without Redis too!"
