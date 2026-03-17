#!/bin/bash
set -e
echo "=== HumanizedTrust Setup ==="

# 1. Create .env
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "[!] Created backend/.env — fill in JWT_SECRET and SERPER_API_KEY before starting"
fi

# 2. Start PostgreSQL
echo "[1/5] Starting PostgreSQL..."
mkdir -p volumes/postgres_data
docker-compose up -d
sleep 5

# 3. Run migrations
echo "[2/5] Running migrations..."
docker exec -i humanizedtrust_postgres psql -U ht_user -d humanizedtrust < migrations/001_initial.sql
echo "      Migrations done"

# 4. Install backend deps
echo "[3/5] Installing backend dependencies..."
cd backend && npm install && cd ..

# 5. Install frontend deps + build
echo "[4/5] Building frontend..."
cd frontend && npm install && npm run build && cd ..

# 6. Start PM2
echo "[5/5] Starting PM2..."
pm2 start backend/src/server.js --name humanizedtrust-backend --env production
pm2 save

echo ""
echo "=== Setup Complete ==="
echo "Backend: http://localhost:3004/api/health"
echo "Frontend: dist/ (serve via nginx)"
echo ""
echo "Next: Create your user account:"
echo "  curl -X POST http://localhost:3004/api/auth/register \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"jan@...\",\"password\":\"...\",\"name\":\"Jan\",\"setup_key\":\"YOUR_SETUP_KEY\"}'"
