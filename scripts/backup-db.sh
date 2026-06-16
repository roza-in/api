#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Check if directory argument is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <project-directory-path>"
  exit 1
fi

PROJECT_DIR=$1

# Resolve relative path to absolute
PROJECT_DIR=$(eval echo "$PROJECT_DIR")
PROJECT_DIR=$(readlink -f "$PROJECT_DIR")

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Error: Directory $PROJECT_DIR does not exist."
  exit 1
fi

cd "$PROJECT_DIR"

# Load environment variables from .env.docker
if [ -f .env.docker ]; then
  # Export AWS environment variables
  export $(grep -E '^(AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_S3_BUCKET|AWS_REGION)=' .env.docker | xargs)
  
  # Parse database name from DATABASE_URL
  DB_URL=$(grep '^DATABASE_URL=' .env.docker | cut -d '=' -f2- | tr -d '"')
  DB_NAME=$(echo "$DB_URL" | awk -F/ '{print $NF}' | cut -d? -f1)
else
  echo "Error: .env.docker not found in $PROJECT_DIR."
  exit 1
fi

if [ -z "$DB_NAME" ]; then
  echo "Error: Could not parse database name from DATABASE_URL."
  exit 1
fi

# Determine environment name from directory path
if [[ "$PROJECT_DIR" == *"staging"* ]]; then
  ENV_NAME="staging"
else
  ENV_NAME="production"
fi

echo "=== Starting database backup ==="
echo "Environment: $ENV_NAME"
echo "Project Directory: $PROJECT_DIR"
echo "Database Name: $DB_NAME"
echo "S3 Bucket: $AWS_S3_BUCKET"
echo "Time: $(date)"

# Filename with date and time
FILENAME="backup-$ENV_NAME-$(date +%F-%H%M%S).sql.gz"

# Run pg_dump inside the docker container and compress it
echo "Dumping database..."
docker compose exec -T postgres pg_dump -U postgres "$DB_NAME" | gzip > "$FILENAME"

echo "Backup created locally: $FILENAME"

# Upload to S3 using the official AWS CLI Docker image (prevents host OS dependency issues)
echo "Uploading backup to S3..."
docker run --rm \
  -v "$(pwd)/$FILENAME:/$FILENAME" \
  -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION="$AWS_REGION" \
  amazon/aws-cli s3 cp "/$FILENAME" "s3://$AWS_S3_BUCKET/$ENV_NAME/backups/db/$FILENAME"

# Remove local backup file
rm "$FILENAME"

echo "Database backup completed successfully and uploaded to S3!"
