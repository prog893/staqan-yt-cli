class StaqanYt < Formula
  desc "CLI tool for managing YouTube videos and metadata using the YouTube Data API v3"
  homepage "https://github.com/prog893/staqan-yt-cli"
  version "1.1.0"
  license "MIT"

  # SHA256 checksums are automatically updated by scripts/release.sh
  on_macos do
    on_arm do
      url "https://github.com/prog893/staqan-yt-cli/releases/download/v#{version}/staqan-yt-macos-arm64.tar.gz"
      sha256 "PLACEHOLDER_ARM64_SHA256" # arm64
    end

    on_intel do
      url "https://github.com/prog893/staqan-yt-cli/releases/download/v#{version}/staqan-yt-macos-x64.tar.gz"
      sha256 "PLACEHOLDER_X64_SHA256" # x64
    end
  end

  def install
    if Hardware::CPU.arm?
      bin.install "staqan-yt-macos-arm64" => "staqan-yt"
    else
      bin.install "staqan-yt-macos-x64" => "staqan-yt"
    end
  end

  def caveats
    <<~EOS
      Before using staqan-yt, you need to set up OAuth credentials:

      1. Create credentials at: https://console.cloud.google.com/apis/credentials
      2. Download the credentials.json file
      3. Place it in: ~/.staqan-yt-cli/credentials.json
      4. Run: staqan-yt auth

      For detailed setup instructions, visit:
      https://github.com/prog893/staqan-yt-cli#setup
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/staqan-yt --version")
  end
end
