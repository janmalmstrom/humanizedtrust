#!/bin/bash
# HumanizedTrust Full Backup Script
# Run this BEFORE every deployment

set -e

# Configuration
BACKUP_DIR="$HOME/backups/humanizedtrust"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"
PROJECT_DIR="$HOME/humanizedtrust"
DB_HOST="localhost"
DB_PORT="5435"
DB_NAME="humanizedtrust"
DB_USER="ht_user"
DB_PASSWORD="HT_sK9mPqW3nVbX7"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  HumanizedTrust Full Backup${NC}"
echo -e "${YELLOW}  Timestamp: $TIMESTAMP${NC}"
echo -e "${YELLOW}========================================${NC}"

mkdir -p "$BACKUP_PATH"

# 1. Database backup
echo -e "\n${YELLOW}[1/4] Backing up PostgreSQL database...${NC}"
PGPASSWORD=$DB_PASSWORD pg_dump -U $DB_USER -h $DB_HOST -p $DB_PORT $DB_NAME > "$BACKUP_PATH/database.sql"
if [ $? -eq 0 ]; then
    gzip "$BACKUP_PATH/database.sql"
    echo -e "${GREEN}✓ Database backup complete${NC}"
else
    echo -e "${RED}✗ Database backup FAILED${NC}"
    exit 1
fi

# 2. Backend code
echo -e "\n${YELLOW}[2/4] Backing up backend code...${NC}"
tar -czf "$BACKUP_PATH/backend.tar.gz" -C "$PROJECT_DIR" --exclude='backend/node_modules' backend
echo -e "${GREEN}✓ Backend backup complete${NC}"

# 3. Frontend code
echo -e "\n${YELLOW}[3/4] Backing up frontend code...${NC}"
tar -czf "$BACKUP_PATH/frontend.tar.gz" -C "$PROJECT_DIR" --exclude='frontend/node_modules' --exclude='frontend/dist' frontend
echo -e "${GREEN}✓ Frontend backup complete${NC}"

# 4. Environment files (secrets — not in git)
echo -e "\n${YELLOW}[4/4] Backing up environment files...${NC}"
[ -f "$PROJECT_DIR/backend/.env" ] && cp "$PROJECT_DIR/backend/.env" "$BACKUP_PATH/backend.env"
[ -f "$PROJECT_DIR/frontend/.env" ] && cp "$PROJECT_DIR/frontend/.env" "$BACKUP_PATH/frontend.env"
echo -e "${GREEN}✓ Environment files backup complete${NC}"

# Cleanup — keep last 10 local backups
echo -e "\n${YELLOW}Cleaning up old local backups (keeping last 10)...${NC}"
cd "$BACKUP_DIR"
ls -t | tail -n +11 | xargs -r rm -rf
echo -e "${GREEN}✓ Cleanup complete${NC}"

# Upload to S3 (offsite)
echo -e "\n${YELLOW}Uploading to S3...${NC}"
S3_BUCKET="janmalmstrom-backups"
if aws s3 sync "$BACKUP_PATH" "s3://$S3_BUCKET/humanizedtrust/$TIMESTAMP/" --quiet; then
    echo -e "${GREEN}✓ Offsite backup complete (s3://$S3_BUCKET/humanizedtrust/$TIMESTAMP/)${NC}"
    # Keep only last 30 in S3
    aws s3 ls "s3://$S3_BUCKET/humanizedtrust/" | awk '{print $2}' | sort | head -n -30 | \
        xargs -I{} aws s3 rm "s3://$S3_BUCKET/humanizedtrust/{}" --recursive --quiet 2>/dev/null || true
else
    echo -e "${YELLOW}⚠ S3 upload failed — local backup still intact${NC}"
fi

# Summary
BACKUP_SIZE=$(du -sh "$BACKUP_PATH" | cut -f1)
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  BACKUP COMPLETE${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Location : $BACKUP_PATH"
echo -e "S3       : s3://$S3_BUCKET/humanizedtrust/$TIMESTAMP/"
echo -e "Size     : $BACKUP_SIZE"
echo -e "Contents :"
ls -lh "$BACKUP_PATH"
echo -e "\n${GREEN}Safe to deploy now!${NC}"
