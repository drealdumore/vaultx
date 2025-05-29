# Clipboard Saver API

A production-ready REST API for temporarily storing and sharing text clips across devices. Built with Node.js, Express, and TypeScript.

## Features

- ✅ **Hybrid storage** - In-memory + Redis for speed & persistence
- ✅ **Secure temporary storage** with auto-expiration
- ✅ **Password protection** for sensitive clips
- ✅ **Burn after reading** functionality
- ✅ **Rate limiting** and security headers
- ✅ **Access tracking** and statistics
- ✅ **Production-ready** with proper error handling
- ✅ **RESTful API** with comprehensive validation
- ✅ **Redis fallback** - Works with or without Redis

## Quick Start

```bash
# Clone and setup
git clone https://github.com/drealdumore/vaultx.git
cd vaultx

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start development server
pnpm dev
```

The API will be running at `http://localhost:8000`

## API Endpoints

### 📝 Create Clip

**POST** `/api/clip`

Create a new temporary clip and get a unique access token.

```bash
curl -X POST http://localhost:8000/api/clip \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello, World!",
    "contentType": "text",
    "expirationMinutes": 60,
    "password": "optional-password",
    "burnAfterReading": false,
    "maxAccess": 10
  }'
```

**Request Body:**

- `content` (required): The text content to store (max 100KB)
- `contentType` (optional): `text`, `url`, or `code` (default: `text`)
- `expirationMinutes` (optional): 1-10080 minutes (default: 60)
- `password` (optional): 4-100 characters
- `burnAfterReading` (optional): Delete after first access
- `maxAccess` (optional): Maximum number of accesses (1-1000)

**Response:**

```json
{
  "success": true,
  "token": "a1b2c3d4e5f6...",
  "url": "http://localhost:8000/api/clip/a1b2c3d4e5f6...",
  "expiresAt": "2024-05-29T15:30:00.000Z",
  "expiresIn": "60 minutes",
  "message": "Clip created successfully"
}
```

### 📖 Retrieve Clip

**GET** `/api/clip/:token`

Retrieve a clip using its token. Increments access count.

```bash
# Without password
curl http://localhost:8000/api/clip/a1b2c3d4e5f6...

# With password
curl "http://localhost:8000/api/clip/a1b2c3d4e5f6...?password=your-password"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "content": "Hello, World!",
    "contentType": "text",
    "createdAt": "2024-05-29T14:30:00.000Z",
    "accessCount": 1,
    "burnAfterReading": false
  },
  "metadata": {
    "expiresAt": "2024-05-29T15:30:00.000Z",
    "timeRemaining": 3540000
  }
}
```

### ℹ️ Get Clip Info

**GET** `/api/clip/:token/info`

Get clip metadata without accessing the content or incrementing counters.

```bash
curl http://localhost:8000/api/clip/a1b2c3d4e5f6.../info
```

### 🗑️ Delete Clip

**DELETE** `/api/clip/:token`

Manually delete a clip before expiration.

```bash
curl -X DELETE http://localhost:8000/api/clip/a1b2c3d4e5f6...
```

### 📊 Get Statistics

**GET** `/api/stats`

Get storage statistics and metrics.

```bash
curl http://localhost:8000/api/stats
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalClips": 42,
    "activeClips": 38,
    "expiredClips": 4,
    "oldestClip": "2024-05-29T10:00:00.000Z",
    "totalAccesses": 156,
    "redisConnected": true,
    "memoryClips": 42,
    "redisClips": 38
  }
}
```

### 🔍 Health Check

**GET** `/health`

Check API health and status.

```bash
curl http://localhost:8000/health
```

## Environment Variables

```bash
# Server Configuration
PORT=8000
NODE_ENV=development

# Security
ALLOWED_ORIGINS=*

# Rate Limiting (requests per 15 minutes)
RATE_LIMIT_MAX=100

# Redis Configuration (Optional - will use memory-only if not provided)
# REDIS_URL=redis://localhost:6379
# UPSTASH_REDIS_URL=rediss://your-upstash-url
```

## 🔄 Hybrid Storage System

The API uses a **hybrid storage approach** that combines the best of both worlds:

### **Memory-First Architecture:**

- ✅ **Lightning fast** - All clips stored in RAM for instant access
- ✅ **Always works** - No external dependencies required
- ✅ **Zero latency** - Sub-millisecond response times

### **Redis Backup Layer:**

- ✅ **Persistence** - Survives server restarts
- ✅ **Scalability** - Can handle massive loads
- ✅ **Automatic failover** - Falls back to memory if Redis is down
- ✅ **Optional** - Works perfectly without Redis

### **How It Works:**

```
1. Create Clip → Store in Memory + Redis
2. Read Clip → Try Memory → Fallback to Redis → Restore to Memory
3. Server Restart → Memory cleared → Redis restores data automatically
```

## 🚀 Redis Setup (Optional)

### **Option 1: Free Upstash Redis (Recommended)**

1. Sign up at [Upstash](https://upstash.com/)
2. Create a new Redis database
3. Copy the `UPSTASH_REDIS_URL`
4. Set it in your `.env` file

### **Option 2: Local Redis**

```bash
# Install Redis locally
brew install redis  # macOS
sudo apt install redis-server  # Ubuntu

# Start Redis
redis-server

# Set in .env
REDIS_URL=redis://localhost:6379
```

### **Option 3: No Redis (Memory Only)**

Simply don't set any Redis environment variables - the API will work perfectly with in-memory storage only!

## Production Deployment

### Build for Production

```bash
# Build TypeScript
pnpm build

# Start production server
pnpm start
```

### Environment Setup

- Set `NODE_ENV=production`
- Configure `ALLOWED_ORIGINS` for CORS
- Set up reverse proxy (nginx/cloudflare)
- Enable HTTPS
- Monitor logs and health endpoint

## Security Features

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Security Headers**: Helmet.js with CSP, HSTS, etc.
- **Input Validation**: Comprehensive request validation
- **CORS**: Configurable origin restrictions
- **Password Hashing**: SHA-256 for password protection
- **Content Limits**: 100KB max content size
- **Auto-cleanup**: Expired clips removed automatically

## Error Handling

All errors return consistent JSON format:

```json
{
  "error": "Error message",
  "details": "Additional details",
  "timestamp": "2024-05-29T14:30:00.000Z",
  "path": "/api/clip"
}
```

**Common HTTP Status Codes:**

- `200` - Success
- `201` - Created
- `400` - Bad Request / Validation Error
- `404` - Clip Not Found / Expired
- `413` - Payload Too Large
- `429` - Rate Limited
- `500` - Internal Server Error

## Use Cases

- **Cross-device clipboard** sync
- **Temporary password** sharing
- **Code snippet** sharing
- **Meeting links** distribution
- **One-time secrets** sharing
- **Quick note** passing

## Performance Notes

- **Hybrid storage** - Memory-first with Redis backup
- **Sub-millisecond access** from memory layer
- **Automatic failover** if Redis is unavailable
- **Intelligent caching** - Redis data restored to memory on access
- **Automatic cleanup** prevents memory leaks
- **Compression** for reduced bandwidth
- **Efficient token generation** with crypto
- **Optimized for high-frequency** short-lived content
- **Zero downtime** - Works with or without Redis
