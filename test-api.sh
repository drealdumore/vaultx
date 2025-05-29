#!/bin/bash

API_BASE="http://localhost:8000"

echo "🧪 Testing Clipboard Saver API..."
echo

# Test health check
echo "1. Testing health check..."
curl -s "$API_BASE/health" 
echo

# Test creating a clip
echo "2. Creating a test clip..."
RESPONSE=$(curl -s -X POST "$API_BASE/api/clip" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello, World! This is a test clip from the test script.",
    "contentType": "text",
    "expirationMinutes": 10,
    "burnAfterReading": false
  }')

echo "$RESPONSE" 
TOKEN=$(echo "$RESPONSE")
echo
echo "Generated token: $TOKEN"
echo

# Test retrieving the clip
echo "3. Retrieving the clip..."
curl -s "$API_BASE/api/clip/$TOKEN" 
echo

# Test clip info
echo "4. Getting clip info..."
curl -s "$API_BASE/api/clip/$TOKEN/info" 
echo

# Test stats
echo "5. Getting statistics..."
curl -s "$API_BASE/api/stats" 
echo

# Test password-protected clip
echo "6. Creating password-protected clip..."
PROTECTED_RESPONSE=$(curl -s -X POST "$API_BASE/api/clip" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This is a secret message!",
    "password": "test123",
    "expirationMinutes": 5
  }')

echo "$PROTECTED_RESPONSE" 
PROTECTED_TOKEN=$(echo "$PROTECTED_RESPONSE")
echo

# Test retrieving protected clip without password
echo "7. Trying to access protected clip without password..."
curl -s "$API_BASE/api/clip/$PROTECTED_TOKEN" 
echo

# Test retrieving protected clip with password
echo "8. Accessing protected clip with password..."
curl -s "$API_BASE/api/clip/$PROTECTED_TOKEN?password=test123" 
echo

# Test burn after reading
echo "9. Creating burn-after-reading clip..."
BURN_RESPONSE=$(curl -s -X POST "$API_BASE/api/clip" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This message will self-destruct after reading!",
    "burnAfterReading": true,
    "expirationMinutes": 10
  }')

echo "$BURN_RESPONSE" 
BURN_TOKEN=$(echo "$BURN_RESPONSE")
echo

echo "10. Reading burn-after-reading clip (should delete it)..."
curl -s "$API_BASE/api/clip/$BURN_TOKEN" 
echo

echo "11. Trying to read burn-after-reading clip again (should fail)..."
curl -s "$API_BASE/api/clip/$BURN_TOKEN" 
echo

# Test deletion
echo "12. Deleting the original clip..."
curl -s -X DELETE "$API_BASE/api/clip/$TOKEN" 
echo

echo "13. Final statistics..."
curl -s "$API_BASE/api/stats" 
echo

echo "✅ API testing complete!"
