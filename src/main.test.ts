import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest'
import { WebClient } from '@slack/web-api'

// Setup mocks before importing the main module
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}))

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn()
}))

vi.mock('path', () => ({
  default: {
    dirname: vi.fn().mockReturnValue('/mock-dir'),
    join: vi.fn().mockImplementation((...args) => args.join('/'))
  },
  dirname: vi.fn().mockReturnValue('/mock-dir'),
  join: vi.fn().mockImplementation((...args) => args.join('/'))
}))

vi.mock('url', () => ({
  default: {
    fileURLToPath: vi.fn().mockReturnValue('/mock-file-path')
  },
  fileURLToPath: vi.fn().mockReturnValue('/mock-file-path')
}))

// Import dependencies after mocks are set up
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Import the main module after mocks are set up
import { main } from './main'
import {SLACK_MSG} from './consts'

// Create test helper
function mockFileSystem(files: Record<string, string>) {
  vi.mocked(fs.readFileSync).mockImplementation((path) => {
    const filePath = String(path);
    if (filePath.includes('current') && files.current) {
      return files.current;
    }
    if (filePath.includes('queue') && files.queue) {
      return files.queue;
    }
    throw new Error(`Mock file not found: ${filePath}`);
  });
}

describe('Slack Notification Bot', () => {
  const originalEnv = process.env
  const originalExit = process.exit
  const originalConsoleError = console.error
  const originalConsoleLog = console.log
  
  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.resetAllMocks()
    
    // Mock process.exit
    process.exit = vi.fn() as any
    
    // Mock console methods
    console.error = vi.fn()
    console.log = vi.fn()
  })
  
  afterEach(() => {
    process.env = originalEnv
    process.exit = originalExit
    console.error = originalConsoleError
    console.log = originalConsoleLog
  })
  
  describe('main function', () => {
    it('should throw an error for unknown command', async () => {
      await main(['unknown-command'])
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown command: unknown-command'))
      expect(process.exit).toHaveBeenCalledWith(1)
    })
    
    it('should throw an error if SLACK_BOT_TOKEN is not set', async () => {
      process.env.SLACK_BOT_TOKEN = ''
      mockFileSystem({
        current: 'U12345, Test User',
        queue: 'U12345, Test User'
      })
      
      await main(['notify'])
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('SLACK_BOT_TOKEN env var not set'))
      expect(process.exit).toHaveBeenCalledWith(1)
    })
  })
  
  describe('notify command', () => {
    it('should send a message to the current person', async () => {
      // Setup environment
      process.env.SLACK_BOT_TOKEN = 'mock-token'
      process.env.SLACK_CHANNEL = 'mock-channel'
      
      // Setup files
      mockFileSystem({
        current: 'U12345, John Doe',
        queue: 'U12345, John Doe\nU67890, Second Person'
      })
      
      // Setup Slack client mock
      const mockPostMessage = vi.fn().mockResolvedValue({ ok: true })
      vi.mocked(WebClient).mockImplementation(() => {
        return {
          chat: {
            postMessage: mockPostMessage
          }
        } as any
      })
      
      // Execute
      await main(['notify'])
      
      // Verify
      expect(mockPostMessage).toHaveBeenCalledWith({
        channel: 'mock-channel',
        text: 'Hi <@U12345>,'  + SLACK_MSG,
        mrkdwn: true
      })
    })
    
    it('should throw an error if SLACK_CHANNEL is not set', async () => {
      // Setup
      process.env.SLACK_BOT_TOKEN = 'mock-token'
      process.env.SLACK_CHANNEL = ''
      
      mockFileSystem({
        current: 'U12345, John Doe',
        queue: 'U12345, John Doe\nU67890, Second Person'
      })
      
      // Execute and verify
      await main(['notify'])
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('SLACK_CHANNEL env var not set'))
      expect(process.exit).toHaveBeenCalledWith(1)
    })
    
    it('should handle errors when reading current person file is not found', async () => {
      // Setup
      process.env.SLACK_BOT_TOKEN = 'mock-token'
      process.env.SLACK_CHANNEL = 'mock-channel'
      
      // Setup file system with missing current file
      let currentAttempted = false
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        const filePath = String(path)
        if (filePath.includes('current')) {
          currentAttempted = true
          throw new Error('File not found')
        }
        if (filePath.includes('queue') && currentAttempted) {
          return 'U12345, First Person\nU67890, Second Person'
        }
        throw new Error(`Unexpected file: ${filePath}`)
      })
      
      // Setup Slack client mock
      const mockPostMessage = vi.fn().mockResolvedValue({ ok: true })
      vi.mocked(WebClient).mockImplementation(() => {
        return {
          chat: {
            postMessage: mockPostMessage
          }
        } as any
      })
      
      // Execute
      await main(['notify'])
      
      // Verify that it falls back to the first person in queue
      expect(mockPostMessage).toHaveBeenCalledWith({
        channel: 'mock-channel',
        text: 'Hi <@U12345>,'  + SLACK_MSG,
        mrkdwn: true
      })
    })
    
    it('should handle empty queue error', async () => {
      // Setup
      process.env.SLACK_BOT_TOKEN = 'mock-token'
      process.env.SLACK_CHANNEL = 'mock-channel'
      
      // Setup file system with missing current file and empty queue
      let currentAttempted = false
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        const filePath = String(path)
        if (filePath.includes('current')) {
          currentAttempted = true
          throw new Error('File not found')
        }
        if (filePath.includes('queue') && currentAttempted) {
          return ''
        }
        throw new Error(`Unexpected file: ${filePath}`)
      })
      
      // Execute
      await main(['notify'])
      
      // Verify
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error: Queue is empty'))
      expect(process.exit).toHaveBeenCalledWith(1)
    })
  })
  
  describe('rotate command', () => {
    it('should rotate to the next person in queue', async () => {
      // Setup
      mockFileSystem({
        current: 'U12345, First Person',
        queue: 'U12345, First Person\nU67890, Second Person\nU24680, Third Person'
      })
      
      // Execute
      await main(['rotate'])
      
      // Verify
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.anything(), 'U67890, Second Person')
    })
    
    it('should handle when current person is not in queue', async () => {
      // Setup
      mockFileSystem({
        current: 'U99999, Not In Queue',
        queue: 'U12345, First Person\nU67890, Second Person'
      })
      
      // Execute
      await main(['rotate'])
      
      // Verify - should rotate to the first person in queue
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.anything(), 'U12345, First Person')
    })
    
    it('should wrap around to the first person when at the end of queue', async () => {
      // Setup
      mockFileSystem({
        current: 'U24680, Third Person',
        queue: 'U12345, First Person\nU67890, Second Person\nU24680, Third Person'
      })
      
      // Execute
      await main(['rotate'])
      
      // Verify - should rotate to the first person
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.anything(), 'U12345, First Person')
    })
    
    it('should handle queue with only one person', async () => {
      // Setup
      mockFileSystem({
        current: 'U12345, Only Person',
        queue: 'U12345, Only Person'
      })
      
      // Execute
      await main(['rotate'])
      
      // Verify - should not call writeFileSync for single-person queue
      expect(fs.writeFileSync).not.toHaveBeenCalled()
      expect(console.log).toHaveBeenCalledWith('Queue has only one person or is empty, no need to rotate')
    })
    
    it('should handle empty queue', async () => {
      // Setup - Mock empty queue
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        const filePath = String(path);
        if (filePath.includes('current')) {
          return 'U12345, Person';
        }
        if (filePath.includes('queue')) {
          return '';
        }
        throw new Error(`Unexpected file: ${filePath}`);
      });
      
      // Execute
      await main(['rotate']);
      
      // Verify
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('Queue has only one person or is empty, no need to rotate');
    })
  })
})
