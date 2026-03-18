class StaqanYt < Formula
  desc "CLI tool for managing YouTube videos and metadata using the YouTube Data API v3"
  homepage "https://github.com/prog893/staqan-yt-cli"
  version "2.0.3"
  license "MIT"

  # Source-based installation from GitHub repo
  # Works with private repos since Homebrew can use git credentials
  url "https://github.com/prog893/staqan-yt-cli.git",
      tag:      "v#{version}"

  # Require bun from the official Homebrew tap
  depends_on "oven-sh/bun/bun"

  def install
    # Use bun from Homebrew
    bun = Formula["bun"].opt_bin/"bun"

    # Install dependencies
    system bun, "install"

    # Build the binary using Bun's compile feature
    if Hardware::CPU.arm?
      system bun, "build", "./bin/staqan-yt.ts", "--compile", "--target=bun-darwin-arm64", "--outfile", "staqan-yt"
    else
      system bun, "build", "./bin/staqan-yt.ts", "--compile", "--target=bun-darwin-x64", "--outfile", "staqan-yt"
    end

    # Install the compiled binary
    bin.install "staqan-yt"

    # Generate and install shell completions
    # Generate zsh completion
    zsh_comp = Utils.popen_read("#{bin}/staqan-yt", "config", "completion", "zsh", "--print")
    (buildpath/"_staqan-yt").write zsh_comp
    zsh_completion.install buildpath/"_staqan-yt"

    # Generate bash completion
    bash_comp = Utils.popen_read("#{bin}/staqan-yt", "config", "completion", "bash", "--print")
    (share/"bash-completion/completions"/"staqan-yt").write bash_comp
  end

  def caveats
    <<~EOS
      Before using staqan-yt, you need to set up OAuth credentials:

      1. Create credentials at: https://console.cloud.google.com/apis/credentials
      2. Download the credentials.json file
      3. Place it in: ~/.staqan-yt-cli/credentials.json
      4. Run: staqan-yt auth

      Shell completions have been installed for zsh (default) and bash.
      To enable completions, reload your shell or run:
        source ~/.zshrc  # for zsh
        source ~/.bashrc # for bash

      For detailed setup instructions, visit:
      https://github.com/prog893/staqan-yt-cli#setup
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/staqan-yt --version")
  end
end
