import { Test, TestingModule } from '@nestjs/testing';
import * as http from 'http';
import { OpenRouterService, OpenRouterResponse } from './openrouter.service';
import { DatabaseService } from './database.service';
import { createDefaultDatabase, Database } from '../models/database.model';

describe('OpenRouterService', () => {
  let service: OpenRouterService;
  let mockDb: Database;
  let mockServer: http.Server;
  let serverPort: number;
  let serverHandler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => void;

  const mockDatabaseService = {
    read: jest.fn(),
  };

  beforeAll(async () => {
    // Start a local HTTP server to mock OpenRouter API
    mockServer = http.createServer((req, res) => {
      serverHandler(req, res);
    });
    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  beforeEach(async () => {
    mockDb = createDefaultDatabase();
    mockDb.settings.openRouterApiKey = 'test-api-key';
    mockDb.settings.openRouterModel = 'test/model';
    mockDatabaseService.read.mockResolvedValue(mockDb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenRouterService,
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<OpenRouterService>(OpenRouterService);

    // Override baseUrl to point to our mock server
    (service as any).baseUrl = `http://127.0.0.1:${serverPort}/v1/chat/completions`;
    // Reduce retry delay for tests
    (service as any).baseDelayMs = 10;
  });

  describe('replaceTemplateVariables', () => {
    it('should replace single variable', () => {
      const result = service.replaceTemplateVariables(
        'Hello {{name}}!',
        { name: 'World' },
      );
      expect(result).toBe('Hello World!');
    });

    it('should replace multiple variables', () => {
      const result = service.replaceTemplateVariables(
        '{{greeting}} {{name}}, welcome to {{place}}!',
        { greeting: 'Hello', name: 'Alice', place: 'Wonderland' },
      );
      expect(result).toBe('Hello Alice, welcome to Wonderland!');
    });

    it('should leave unmatched variables unchanged', () => {
      const result = service.replaceTemplateVariables(
        'Hello {{name}}, your ID is {{id}}',
        { name: 'Bob' },
      );
      expect(result).toBe('Hello Bob, your ID is {{id}}');
    });

    it('should handle empty variables', () => {
      const result = service.replaceTemplateVariables('No variables here', {});
      expect(result).toBe('No variables here');
    });

    it('should handle template with no placeholders', () => {
      const result = service.replaceTemplateVariables('Plain text', {
        unused: 'value',
      });
      expect(result).toBe('Plain text');
    });
  });

  describe('sendRequest', () => {
    it('should throw if API key is not configured', async () => {
      mockDb.settings.openRouterApiKey = '';
      mockDatabaseService.read.mockResolvedValue(mockDb);

      await expect(
        service.sendRequest({
          messages: [{ role: 'user', content: 'test' }],
        }),
      ).rejects.toThrow('OpenRouter API key is not configured');
    });

    it('should send request and parse response', async () => {
      serverHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: 'Hello from AI' } }],
            model: 'test/model',
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
        );
      };

      const result: OpenRouterResponse = await service.sendRequest({
        messages: [{ role: 'user', content: 'Say hello' }],
      });

      expect(result.content).toBe('Hello from AI');
      expect(result.model).toBe('test/model');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(5);
      expect(result.usage.totalTokens).toBe(15);
    });

    it('should use settings model by default', async () => {
      let receivedBody = '';
      serverHandler = (req, res) => {
        let data = '';
        req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        req.on('end', () => {
          receivedBody = data;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [{ message: { content: 'ok' } }],
              model: 'test/model',
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          );
        });
      };

      await service.sendRequest({
        messages: [{ role: 'user', content: 'test' }],
      });

      const parsed = JSON.parse(receivedBody);
      expect(parsed.model).toBe('test/model');
    });

    it('should allow overriding model per request', async () => {
      let receivedBody = '';
      serverHandler = (req, res) => {
        let data = '';
        req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        req.on('end', () => {
          receivedBody = data;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [{ message: { content: 'ok' } }],
              model: 'custom/model',
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          );
        });
      };

      await service.sendRequest({
        messages: [{ role: 'user', content: 'test' }],
        model: 'custom/model',
      });

      const parsed = JSON.parse(receivedBody);
      expect(parsed.model).toBe('custom/model');
    });

    it('should send Authorization header with API key', async () => {
      let receivedAuth = '';
      serverHandler = (req, res) => {
        receivedAuth = req.headers['authorization'] as string;
        let data = '';
        req.on('data', () => { data += ''; });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [{ message: { content: 'ok' } }],
              model: 'test/model',
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          );
        });
      };

      await service.sendRequest({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(receivedAuth).toBe('Bearer test-api-key');
    });

    it('should retry on API errors with exponential backoff', async () => {
      let callCount = 0;
      serverHandler = (_req, res) => {
        callCount++;
        if (callCount <= 2) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Server error' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [{ message: { content: 'success after retry' } }],
              model: 'test/model',
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          );
        }
      };

      const result = await service.sendRequest({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.content).toBe('success after retry');
      expect(callCount).toBe(3);
    });

    it('should throw after exhausting all retries', async () => {
      serverHandler = (_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error' }));
      };

      await expect(
        service.sendRequest({
          messages: [{ role: 'user', content: 'test' }],
        }),
      ).rejects.toThrow('OpenRouter API error 500');
    });

    it('should throw if response has no content', async () => {
      serverHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: {} }] }));
      };

      await expect(
        service.sendRequest({
          messages: [{ role: 'user', content: 'test' }],
        }),
      ).rejects.toThrow('No content in OpenRouter response');
    });
  });

  describe('sendPrompt', () => {
    beforeEach(() => {
      serverHandler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: 'prompt response' } }],
            model: 'test/model',
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
      };
    });

    it('should replace variables and send prompt', async () => {
      let receivedBody = '';
      serverHandler = (req, res) => {
        let data = '';
        req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        req.on('end', () => {
          receivedBody = data;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [{ message: { content: 'response' } }],
              model: 'test/model',
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          );
        });
      };

      const result = await service.sendPrompt(
        'Generate a PRD for {{projectName}}',
        { projectName: 'MyProject' },
      );

      expect(result).toBe('response');
      const parsed = JSON.parse(receivedBody);
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.messages[0].content).toBe('Generate a PRD for MyProject');
    });

    it('should include system prompt when provided', async () => {
      let receivedBody = '';
      serverHandler = (req, res) => {
        let data = '';
        req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        req.on('end', () => {
          receivedBody = data;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [{ message: { content: 'response' } }],
              model: 'test/model',
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          );
        });
      };

      await service.sendPrompt('Hello', {}, {
        systemPrompt: 'You are a helpful assistant',
      });

      const parsed = JSON.parse(receivedBody);
      expect(parsed.messages).toHaveLength(2);
      expect(parsed.messages[0].role).toBe('system');
      expect(parsed.messages[0].content).toBe('You are a helpful assistant');
      expect(parsed.messages[1].role).toBe('user');
    });
  });
});
