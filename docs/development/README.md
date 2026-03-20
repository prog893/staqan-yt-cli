# Development Guides

This directory contains comprehensive guides for developing and maintaining the staqan-yt-cli project. These guides are designed for progressive disclosure—read what you need, when you need it.

## 🚀 Quick Start Paths

### I want to add a new command
1. Read [Adding Commands Guide](adding-commands.md) - Step-by-step process
2. Reference [TypeScript Guide](typescript-guide.md) - Type safety patterns
3. Check [Testing Guide](testing-guide.md) - How to test your changes
4. Follow [Git Workflow](git-workflow.md) - Branch, commit, and release

### I'm new to the project
1. Read [CLAUDE.md](../../CLAUDE.md) - Critical rules and quick reference
2. Review [Architecture Guide](architecture.md) - Understand the codebase
3. Explore [YouTube API Guide](youtube-api-guide.md) - Domain-specific patterns
4. Read [Error Handling Guide](error-handling.md) - Error patterns

### I found a security vulnerability
1. Read [Security Guide](security-guide.md) - Security best practices
2. Check [Maintenance Guide](maintenance-guide.md) - Dependabot workflow
3. Follow [Git Workflow](git-workflow.md) - Patch release process

### I need to update dependencies
1. Read [Maintenance Guide](maintenance-guide.md) - Dependabot and updates
2. Follow [Testing Guide](testing-guide.md) - Test after updates
3. Use [Git Workflow](git-workflow.md) - Release process

## 📚 All Guides

### Core Development
- **[TypeScript Guide](typescript-guide.md)** - TypeScript configuration, type safety, ESLint, and common patterns
- **[Adding Commands Guide](adding-commands.md)** - Step-by-step command creation with templates
- **[Testing Guide](testing-guide.md)** - Manual testing strategies and local development
- **[Error Handling Guide](error-handling.md)** - User-friendly error patterns

### Implementation Details
- **[Output Formats Guide](output-formats.md)** - Implementing JSON, table, CSV, and pretty output
- **[YouTube API Guide](youtube-api-guide.md)** - YouTube Data API v3 patterns and quotas
- **[Security Guide](security-guide.md)** - OAuth security and input validation
- **[Architecture Guide](architecture.md)** - Lock strategy, hidden commands, scope boundaries
- **[Shell Completion Guide](shell-completion-guide.md)** - Bash/zsh completion patterns, variadic flags, and adding new completions

### Maintenance & Operations
- **[Git Workflow Guide](git-workflow.md)** - Branch strategy, commits, releases, and protection
- **[Maintenance Guide](maintenance-guide.md)** - Dependency updates and Dependabot vulnerability management
- **[Troubleshooting Guide](troubleshooting.md)** - TypeScript and build error resolution

## 📖 Related Documentation

- **[CLAUDE.md](../../CLAUDE.md)** - Critical rules and quick reference (start here!)
- **[README.md](../../README.md)** - User-facing documentation
- **[CONTRIBUTING.md](../../CONTRIBUTING.md)** - Contributor guide for humans
- **[docs/](../README.md)** - Comprehensive command reference

## 🎯 Guide Philosophy

These guides follow progressive disclosure principles:

1. **Quick reference first** - CLAUDE.md has the essentials
2. **Deep dive when needed** - Each guide focuses on one topic
3. **Cross-references** - Guides link to related content
4. **Examples over theory** - Real code patterns from the codebase
5. **Why and how** - Rationale followed by implementation

## 🔄 Contributing to Guides

When updating these guides:
- Keep each guide focused on a single topic
- Use real examples from the codebase
- Cross-reference related guides
- Update CLAUDE.md if the change affects critical rules
- Test examples against actual code behavior
