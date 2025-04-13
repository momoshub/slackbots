import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { main } from './main'
import { WebClient } from '@slack/web-api'
import * as fs from 'fs'

// Mock Slack Web API
vi.mock('@slack/web-api', () => {
  return {
    WebClient: vi.fn(() => ({
      chat: {
        postMessage: vi.fn()
      }
    }))
  }
})

// Mock fs module
vi.mock('fs', () => {
  return {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  }
})

// Mock path module
vi.mock('path', () => {
  return {
    default: {
      join: vi.fn((...args) => args.join('/')),
      dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/'))
    },
    join: vi.fn((...args) => args.join('/')),
    dirname: vi.fn((p) => p.split('/').slice(0, -1).join('/'))
  }
})

// Mock url module
vi.mock('url', () => {
  return {
    default: {
      fileURLToPath: vi.fn((url) => url.replace('file://', ''))
    },
    fileURLToPath: vi.fn((url) => url.replace('file://', ''))
  }
})

describe('Slack Notification Bot', () => {
  // Save original process.env and console methods
  const originalEnv = process.env
  const originalConsoleLog = console.log
  const originalConsoleError = console.error
  const originalProcessExit = process.exit
  
  // Setup mocks
  let mockExit: ReturnType<typeof vi.fn>
  let consoleLogMock: ReturnType<typeof vi.fn>
  let consoleErrorMock: ReturnType<typeof vi.fn>
  let mockSlack: { chat: { postMessage: any } }
  
  beforeEach(() => {
    // Reset env for each test
    process.env = { ...originalEnv }
    
    // Mock console methods
    consoleLogMock = vi.fn()
    consoleErrorMock = vi.fn()
    console.log = consoleLogMock
    console.error = consoleErrorMock
    
    // Mock process.exit
    mockExit = vi.fn()
    process.exit = mockExit as any
    
    // Setup environment variables
    process.env.SLACK_BOT_TOKEN = 'test-token'
    process.env.SLACK_CHANNEL = 'test-channel'
    
    // Setup Slack mock
    mockSlack = {
      chat: {
        postMessage: vi.fn()
      }
    }
    
    // Override WebClient constructor
    vi.mocked(WebClient).mockImplementation(() => mockSlack as any)
    
    // Reset all mocks
    vi.clearAllMocks()
  })
  
  afterEach(() => {
    // Restore original values
    process.env = originalEnv
    console.log = originalConsoleLog
    console.error = consoleErrorMock
    process.exit = originalProcessExit
  })
  
  describe('main function', () => {
    it('should throw an error for unknown command', async () => {
      await main(['unknown-command'])
      
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('Unknown command')
      )
      expect(mockExit).toHaveBeenCalledWith(1)
    })
    
    it('should throw an error if SLACK_BOT_TOKEN is not set', async () => {
      delete process.env.SLACK_BOT_TOKEN
      
      // Setup mock to return a queue
      vi.mocked(fs.readFileSync).mockReturnValueOnce('U086SJYGQ7M, Kai\nIrshad\nMinh')
      
      await main(['notify'])
      
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('SLACK_BOT_TOKEN env var not set')
      )
      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })
  
  describe('notify command', () => {
    it('should send a message to the current person', async () => {
      // Mock reading the current person
      vi.mocked(fs.readFileSync).mockReturnValueOnce('U086SJYGQ7M, Kai')
      
      // Mock Slack postMessage to resolve successfully
      mockSlack.chat.postMessage.mockResolvedValue({ ok: true })
      
      await main(['notify'])
      
      // Verify that postMessage was called with correct params
      expect(mockSlack.chat.postMessage).toHaveBeenCalledWith({
        channel: 'test-channel',
        text: 'Hi U086SJYGQ7M, Kai, it is your turn',
        unfurl_links: false
      })
      
      // Verify console log
      expect(consoleLogMock).toHaveBeenCalledWith('Notification sent to U086SJYGQ7M, Kai')
    })
    
    it('should throw an error if SLACK_CHANNEL is not set', async () => {
      delete process.env.SLACK_CHANNEL
      
      // Mock reading the current person
      vi.mocked(fs.readFileSync).mockReturnValueOnce('U086SJYGQ7M, Kai')
      
      await main(['notify'])
      
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('SLACK_CHANNEL env var not set')
      )
      expect(mockExit).toHaveBeenCalledWith(1)
    })
    
    it('should handle errors when reading current person file is not found', async () => {
      // Mock reading the current person to throw error
      vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
        throw new Error('File not found')
      })
      
      // Mock reading the queue
      vi.mocked(fs.readFileSync).mockReturnValueOnce('U086SJYGQ7M, Kai\nIrshad\nMinh')
      
      // Mock Slack postMessage to resolve successfully
      mockSlack.chat.postMessage.mockResolvedValue({ ok: true })
      
      await main(['notify'])
      
      // Should use first person in queue
      expect(mockSlack.chat.postMessage).toHaveBeenCalledWith({
        channel: 'test-channel',
        text: 'Hi U086SJYGQ7M, Kai, it is your turn',
        unfurl_links: false
      })
    })
    
    it('should handle empty queue error', async () => {
      // Mock reading the current person to throw error
      vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
        throw new Error('File not found')
      })
      
      // Mock reading the queue to return empty
      vi.mocked(fs.readFileSync).mockReturnValueOnce('')
      
      await main(['notify'])
      
      expect(consoleErrorMock).toHaveBeenCalledWith(
        expect.stringContaining('Queue is empty')
      )
      expect(mockExit).toHaveBeenCalledWith(1)
    })
  })
  
  describe('rotate command', () => {
    it('should rotate to the next person in queue', async () => {
      // Mock reading the current person
      vi.mocked(fs.readFileSync).mockReturnValueOnce('U086SJYGQ7M, Kai')
      
      // Mock reading the queue
      vi.mocked(fs.readFileSync).mockReturnValueOnce('U086SJYGQ7M, Kai\nIrshad\nMinh')
      
      await main(['rotate'])
      
      // Verify that writeFileSync was called with the next person
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(expect.any(String), 'Irshad')
      
      // Verify console log
      expect(consoleLogMock).toHaveBeenCalledWith('Rotated queue: Current person is now Irshad')
    })
    
    it('should handle when current person is not in queue', async () => {
      // Mock reading the current person
      vi.mocked(fs.readFileSync).mockReturnValueOnce('Unknown')
      
      // Mock reading the queue
      vi.mocked(fs.readFileSync).mockReturnValueOnce('U086SJYGQ7M, Kai\nIrshad\nMinh')
      
      await main(['rotate'])
      
      // Verify that writeFileSync was called with the first person
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(expect.any(String), 'U086SJYGQ7M, Kai')
      
      // Verify console log
      expect(consoleLogMock).toHaveBeenCalledWith('Rotated queue: Current person is now U086SJYGQ7M, Kai')
    })
    
    it('should wrap around to the first person when at the end of queue', async () => {
      // Mock reading the current person
      vi.mocked(fs.readFileSync).mockReturnValueOnce('Minh')
      
      // Mock reading the queue
      vi.mocked(fs.readFileSync).mockReturnValueOnce('U086SJYGQ7M, Kai\nIrshad\nMinh')
      
      await main(['rotate'])
      
      // Verify that writeFileSync was called with the first person
      expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledWith(expect.any(String), 'U086SJYGQ7M, Kai')
      
      // Verify console log
      expect(consoleLogMock).toHaveBeenCalledWith('Rotated queue: Current person is now U086SJYGQ7M, Kai')
    })
    
    it('should handle queue with only one person', async () => {
      // Mock reading the queue
      vi.mocked(fs.readFileSync).mockReturnValueOnce('U086SJYGQ7M, Kai')
      
      await main(['rotate'])
      
      // Verify console log
      expect(consoleLogMock).toHaveBeenCalledWith('Queue has only one person or is empty, no need to rotate')
      
      // Verify that writeFileSync was not called
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled()
    })
    
    it('should handle empty queue', async () => {
      // Mock reading the queue
      vi.mocked(fs.readFileSync).mockReturnValueOnce('')
      
      await main(['rotate'])
      
      // Verify console log
      expect(consoleLogMock).toHaveBeenCalledWith('Queue has only one person or is empty, no need to rotate')
      
      // Verify that writeFileSync was not called
      expect(vi.mocked(fs.writeFileSync)).not.toHaveBeenCalled()
    })
  })
}) 