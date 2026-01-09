#!/bin/bash
# Session start hook - Install GitHub CLI if not present

GH_VERSION="2.45.0"
GH_INSTALL_DIR="$HOME/.local/bin"

# PATHに追加（このセッション用）
export PATH="$GH_INSTALL_DIR:$PATH"

if ! command -v gh &> /dev/null; then
  echo "Installing GitHub CLI v${GH_VERSION}..."
  mkdir -p "$GH_INSTALL_DIR"
  cd /tmp
  curl -sL -o gh.tar.gz "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz"
  tar -xzf gh.tar.gz
  cp "gh_${GH_VERSION}_linux_amd64/bin/gh" "$GH_INSTALL_DIR/"
  rm -rf gh.tar.gz "gh_${GH_VERSION}_linux_amd64"
  echo "GitHub CLI installed: $($GH_INSTALL_DIR/gh --version | head -1)"
fi

# PATHを出力（親プロセスに伝えるため）
echo "export PATH=\"$GH_INSTALL_DIR:\$PATH\""
