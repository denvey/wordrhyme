# Pino Logger Adapter Plugin

High-performance Pino logger adapter for WordRhyme CMS.

## Features

- 🚀 Asynchronous logging (non-blocking)
- 📊 Structured JSON output
- 🎨 Pretty printing for development
- 🔗 Child logger support with context binding
- ⚙️ Automatic environment detection

## Installation

This plugin is installed through the WordRhyme plugin system:

```bash
# Install via plugin manager
wordrhyme plugin install logger-pino
```

## Usage

The plugin automatically registers as a logger adapter. To use it:

1. Install the plugin
2. Restart WordRhyme
3. The system will automatically switch to Pino logger

## Configuration

Configure via environment variables:

```bash
LOG_LEVEL=info          # Log level (debug, info, warn, error)
NODE_ENV=production     # Environment (development enables pretty printing)
```

## Performance

Pino is one of the fastest Node.js loggers:
- < 0.5ms per log operation
- Asynchronous I/O
- Minimal overhead

## License

MIT
