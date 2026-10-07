#!/usr/bin/env bash
set -euo pipefail
REGION=${AWS_REGION:-ap-south-1}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws ecr describe-repositories --repository-names loan-crm-api --region "$REGION" >/dev/null 2>&1 || aws ecr create-repository --repository-name loan-crm-api --region "$REGION"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
docker build -t loan-crm-api backend
docker tag loan-crm-api:latest "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/loan-crm-api:latest"
docker push "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/loan-crm-api:latest"
echo "Image pushed. Create/update ECS service using infra/ecs-task-definition.json, RDS PostgreSQL, Secrets Manager and an S3 bucket."
