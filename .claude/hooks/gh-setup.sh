#!/bin/bash
# SessionStart hook: GitHub CLI auto-installation
# - 最新バージョンを自動取得
# - マルチアーキテクチャ対応（amd64/arm64）
# - 冪等性・フェイルセーフ設計

set -e

LOG_PREFIX="[gh-setup]"
LOCAL_BIN="$HOME/.local/bin"

log() {
    echo "$LOG_PREFIX $1" >&2
}

# リモート環境チェック（オプション）
if [ "$CLAUDE_CODE_REMOTE" = "false" ]; then
    log "ローカル環境のためスキップ"
    exit 0
fi

# PATHに追加
export PATH="$LOCAL_BIN:$PATH"

# gh CLIが既にインストール済みかチェック
if command -v gh &>/dev/null; then
    log "gh CLI already installed: $(gh --version | head -1)"
    # PATH永続化
    if [ -n "$CLAUDE_ENV_FILE" ]; then
        echo "export PATH=\"$LOCAL_BIN:\$PATH\"" >> "$CLAUDE_ENV_FILE"
    fi
    exit 0
fi

log "gh CLI not found, installing..."

# ディレクトリ作成
mkdir -p "$LOCAL_BIN"

# 一時ディレクトリ（終了時に自動クリーンアップ）
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# アーキテクチャ検出
ARCH=$(uname -m)
case "$ARCH" in
    x86_64)
        GH_ARCH="amd64"
        ;;
    aarch64|arm64)
        GH_ARCH="arm64"
        ;;
    *)
        log "Unsupported architecture: $ARCH"
        exit 0
        ;;
esac

# 最新バージョンをGitHub APIから取得
log "Fetching latest version..."
GH_VERSION=$(curl -sL "https://api.github.com/repos/cli/cli/releases/latest" | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')

if [ -z "$GH_VERSION" ]; then
    log "Failed to get latest version, using fallback"
    GH_VERSION="2.67.0"  # フォールバックバージョン
fi

log "Installing gh v${GH_VERSION} for ${GH_ARCH}..."

# ダウンロード
GH_TARBALL="gh_${GH_VERSION}_linux_${GH_ARCH}.tar.gz"
GH_URL="https://github.com/cli/cli/releases/download/v${GH_VERSION}/${GH_TARBALL}"

if ! curl -sL "$GH_URL" -o "$TEMP_DIR/$GH_TARBALL"; then
    log "Failed to download gh CLI"
    exit 0
fi

# 展開
if ! tar -xzf "$TEMP_DIR/$GH_TARBALL" -C "$TEMP_DIR"; then
    log "Failed to extract gh CLI"
    exit 0
fi

# インストール
if ! mv "$TEMP_DIR/gh_${GH_VERSION}_linux_${GH_ARCH}/bin/gh" "$LOCAL_BIN/gh"; then
    log "Failed to install gh CLI"
    exit 0
fi

chmod +x "$LOCAL_BIN/gh"

# PATH永続化
if [ -n "$CLAUDE_ENV_FILE" ]; then
    echo "export PATH=\"$LOCAL_BIN:\$PATH\"" >> "$CLAUDE_ENV_FILE"
    log "PATH persisted to CLAUDE_ENV_FILE"
fi

log "gh CLI installed: $($LOCAL_BIN/gh --version | head -1)"
exit 0
