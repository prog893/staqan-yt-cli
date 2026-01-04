#!/bin/bash
# Release script for staqan-yt-cli
# Automates building binaries, creating releases, and updating the Homebrew formula

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

echo -e "${GREEN}=== staqan-yt-cli Release Script ===${NC}"
echo -e "Version: ${GREEN}v${VERSION}${NC}"
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
    echo "Install it with: brew install gh"
    exit 1
fi

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    echo -e "${RED}Error: Bun is not installed${NC}"
    echo "Install it from: https://bun.sh"
    exit 1
fi

# Check if gh is authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI is not authenticated${NC}"
    echo "Run: gh auth login"
    exit 1
fi

# Check if there are uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
    git status -s
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check if tag already exists
if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
    echo -e "${RED}Error: Tag v${VERSION} already exists${NC}"
    echo "Update the version in package.json first"
    exit 1
fi

echo -e "${GREEN}Step 1/7: Cleaning previous builds...${NC}"
rm -rf dist-bin release
mkdir -p dist-bin release

echo -e "${GREEN}Step 2/7: Building macOS arm64 binary...${NC}"
bun build ./bin/staqan-yt.ts --compile --target=bun-darwin-arm64 --outfile dist-bin/staqan-yt-macos-arm64

echo -e "${GREEN}Step 3/7: Building macOS x64 binary...${NC}"
bun build ./bin/staqan-yt.ts --compile --target=bun-darwin-x64 --outfile dist-bin/staqan-yt-macos-x64

echo -e "${GREEN}Step 4/7: Creating tar.gz archives...${NC}"
tar -czf release/staqan-yt-macos-arm64.tar.gz -C dist-bin staqan-yt-macos-arm64
tar -czf release/staqan-yt-macos-x64.tar.gz -C dist-bin staqan-yt-macos-x64

echo -e "${GREEN}Step 5/7: Calculating SHA256 checksums...${NC}"
SHA256_ARM64=$(shasum -a 256 release/staqan-yt-macos-arm64.tar.gz | awk '{print $1}')
SHA256_X64=$(shasum -a 256 release/staqan-yt-macos-x64.tar.gz | awk '{print $1}')

echo "  arm64: ${SHA256_ARM64}"
echo "  x64:   ${SHA256_X64}"

echo -e "${GREEN}Step 6/7: Updating Homebrew formula with SHA256 checksums...${NC}"

# Update the formula with actual SHA256 values
sed -i.bak "s/sha256 \".*\" # arm64/sha256 \"${SHA256_ARM64}\"/" Formula/staqan-yt.rb
sed -i.bak "s/sha256 \".*\" # x64/sha256 \"${SHA256_X64}\"/" Formula/staqan-yt.rb
rm Formula/staqan-yt.rb.bak

# Commit the formula update
git add Formula/staqan-yt.rb
git commit -m "Update Homebrew formula SHA256 for v${VERSION}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>" || true

echo -e "${GREEN}Step 7/7: Creating GitHub release v${VERSION}...${NC}"

# Create git tag
git tag -a "v${VERSION}" -m "Release v${VERSION}"

# Push tag
git push origin "v${VERSION}"

# Create GitHub release with binaries
gh release create "v${VERSION}" \
    release/staqan-yt-macos-arm64.tar.gz \
    release/staqan-yt-macos-x64.tar.gz \
    --title "v${VERSION}" \
    --generate-notes

echo ""
echo -e "${GREEN}=== Release Complete ===${NC}"
echo -e "Version:    ${GREEN}v${VERSION}${NC}"
echo -e "Release:    ${GREEN}https://github.com/prog893/staqan-yt-cli/releases/tag/v${VERSION}${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Users can install with: brew install staqan-yt (if tap is set up)"
echo "2. Or download binaries directly from the release page"
echo ""
echo -e "${YELLOW}Formula SHA256 checksums:${NC}"
echo "  arm64: ${SHA256_ARM64}"
echo "  x64:   ${SHA256_X64}"
