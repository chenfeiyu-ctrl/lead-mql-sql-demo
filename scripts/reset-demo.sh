#!/usr/bin/env bash
# 重置演示环境：重建数据库并重新灌入演示数据。
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ 重置数据库..."
npx prisma migrate reset --force --skip-seed

echo "▶ 灌入演示数据..."
npm run seed

echo "✅ 演示数据已就绪，运行 'npm run dev' 后访问 http://localhost:3000/dashboard"
