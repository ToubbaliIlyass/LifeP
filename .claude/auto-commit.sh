#!/bin/bash
cd /Users/ilyasstoubbali/Documents/Projects/LifeP

# Nothing to commit?
git status --porcelain | grep -q . || exit 0

# Stage all project files — exclude secrets, DB files, backups
git add -A -- \
  ':!.env' ':!.env.local' ':!.env.*.local' \
  ':!*.db' ':!*.db-shm' ':!*.db-wal' \
  ':!data/' ':!node_modules/' 2>/dev/null || true

# Nothing staged after filtering?
git diff --cached --quiet && exit 0

# Infer scope from changed paths
CHANGED=$(git diff --cached --name-only)
N=$(echo "$CHANGED" | grep -c . || true)

SCOPE=""
echo "$CHANGED" | grep -q "src/lib/db/"      && SCOPE="${SCOPE:+$SCOPE+}db"
echo "$CHANGED" | grep -q "drizzle/"          && SCOPE="${SCOPE:+$SCOPE+}migration"
echo "$CHANGED" | grep -q "src/lib/ai/"       && SCOPE="${SCOPE:+$SCOPE+}ai"
echo "$CHANGED" | grep -q "src/app/api/"      && SCOPE="${SCOPE:+$SCOPE+}api"
echo "$CHANGED" | grep -q "src/components/"   && SCOPE="${SCOPE:+$SCOPE+}ui"
echo "$CHANGED" | grep -q "src/app/page"      && SCOPE="${SCOPE:+$SCOPE+}ui"
echo "$CHANGED" | grep -q "src/app/layout"    && SCOPE="${SCOPE:+$SCOPE+}ui"
echo "$CHANGED" | grep -q "PLAN.md"           && SCOPE="${SCOPE:+$SCOPE+}plan"
echo "$CHANGED" | grep -q "scripts/"          && SCOPE="${SCOPE:+$SCOPE+}scripts"
SCOPE=${SCOPE:-misc}

# Use current in-progress phase from PLAN.md as context
PHASE=$(grep -m1 "^## Phase [0-9]" PLAN.md 2>/dev/null | grep -v "✅" | sed 's/## //' | sed 's/ —.*//' | tr -d '\n' || echo "")

if [ -n "$PHASE" ]; then
  MSG="feat($SCOPE): $PHASE — $N file(s) updated"
else
  TOP=$(echo "$CHANGED" | head -2 | tr '\n' ', ' | sed 's/, $//')
  MSG="feat($SCOPE): $TOP"
fi

git commit -m "$MSG

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
