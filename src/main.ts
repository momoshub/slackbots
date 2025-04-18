import 'dotenv/config'
import { WebClient } from '@slack/web-api'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {SLACK_MSG} from './consts'

// Types
type Command = 'notify' | 'rotate'
type CommandHandler = () => Promise<void>

// Path resolution
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')
const queueFilePath = path.join(rootDir, 'queue')
const currentFilePath = path.join(rootDir, 'current')

// Map of available commands
const commands: Record<Command, CommandHandler> = {
  notify: notifyCurrentPerson,
  rotate: rotateQueue
}

// Initialize Slack client
function initSlackClient(): WebClient {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    throw new Error('SLACK_BOT_TOKEN env var not set')
  }
  return new WebClient(token)
}

// Read the queue file
function readQueue(): string[] {
  const content = fs.readFileSync(queueFilePath, 'utf-8')
  return content.trim().split('\n').filter(line => line.trim() !== '')
}

// Read the current person file
function readCurrentPerson(): string {
  try {
    const content = fs.readFileSync(currentFilePath, 'utf-8')
    return content.trim()
  } catch (error) {
    // If the file doesn't exist or can't be read, use the first person in the queue
    const queue = readQueue()
    if (queue.length === 0) {
      throw new Error('Queue is empty')
    }
    return queue[0]
  }
}

// Write the current person to the file
function writeCurrentPerson(name: string): void {
  fs.writeFileSync(currentFilePath, name)
}

// Rotate the queue (move current person to end of queue)
async function rotateQueue(): Promise<void> {
  try {
    const queue = readQueue()
    if (queue.length <= 1) {
      console.log('Queue has only one person or is empty, no need to rotate')
      return
    }
    
    const currentPerson = readCurrentPerson()
    const currentIndex = queue.findIndex(name => name.trim() === currentPerson.trim())
    
    // If current person not found in queue, use the next person after index 0
    const nextIndex = (currentIndex === -1 || currentIndex === queue.length - 1) ? 0 : currentIndex + 1
    const nextPerson = queue[nextIndex]
    
    writeCurrentPerson(nextPerson)
    console.log(`Rotated queue: Current person is now ${nextPerson}`)
  } catch (error) {
    console.error(`Error rotating queue: ${(error as Error).message}`)
    throw error
  }
}

// Send notification to the current person
async function notifyCurrentPerson(): Promise<void> {
  try {
    const client = initSlackClient()
    const currentPerson = readCurrentPerson()
    const channel = process.env.SLACK_CHANNEL
    
    if (!channel) {
      throw new Error('SLACK_CHANNEL env var not set')
    }
    
    const name = currentPerson.split(',')[1].trim()
    const ID = currentPerson.split(',')[0].trim()
    const msg = ID?  `Hi <@${ID}>,${SLACK_MSG}` : `Hi ${name},${SLACK_MSG}`
    await client.chat.postMessage({
      channel,
      text: msg,
      mrkdwn: true
    })
    console.log(`Notification sent to ${name} with msg "${msg}"`)
  } catch (error) {
    console.error(`Error sending notification: ${(error as Error).message}`)
    throw error
  }
}

// Main program
export async function main(args: string[]): Promise<void> {
  try {
    const cmd = args[0] as Command
    if (!cmd || !commands[cmd]) {
      throw new Error(`Unknown command: ${cmd || ''}. Available commands: ${Object.keys(commands).join(', ')}`)
    }
    
    await commands[cmd]()
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`)
    process.exit(1)
  }
}

// CLI entry point
if (import.meta.url.endsWith(process.argv[1]) ) {
  const args = process.argv.slice(2)
  main(args)
} 