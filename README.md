# Slack Queue Notifier

A simple Slack notification system for queue rotation. This tool sends notifications to people in a queue on a scheduled basis and automatically rotates through the queue.

## Features

- Sends Slack notifications to the current person in the queue
- Automatically rotates through a list of people
- Runs on a schedule (weekdays at 2am UTC)
- Maintains queue state in simple text files

## Setup

1. Create a Slack app with the following permissions:
   - `chat:write`
   - `channels:read`

2. Set up environment variables:
   ```
   SLACK_BOT_TOKEN=your-slack-bot-token
   SLACK_CHANNEL=your-channel-id
   SLACK_TEAM_ID=your-team-id
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

4. Create a `queue` file with names (one per line):
   ```
   Name1
   Name2
   Name3
   ```

## Usage

### Send notification to current person
```bash
pnpm notify
```

### Rotate to next person in queue
```bash
pnpm rotate
```

## GitHub Actions Workflows

The system uses two separate GitHub Actions workflow files:

1. **Rotation Workflow** (rotate.yml)
   - Runs at 0:05 AM UTC every Monday
   - Rotates to the next person in the queue
   - Commits the updated current file

2. **Notification Workflow** (notify.yml)
   - Runs at 2:00 AM UTC on weekdays (Monday to Friday)
   - Sends a notification to the current person in the queue

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build the project
pnpm build
```

## Requirements

- Node.js v20+
- pnpm
- Slack workspace with bot token
