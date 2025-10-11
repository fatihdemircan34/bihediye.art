import { OpenAIService } from '../openai.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenAIService - Lyrics Revision', () => {
  let openaiService: OpenAIService;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Mock axios create
    mockAxiosInstance = {
      post: jest.fn(),
    };
    mockedAxios.create = jest.fn(() => mockAxiosInstance);

    openaiService = new OpenAIService({
      apiKey: 'test-key',
      model: 'gpt-4-turbo-preview',
    });
  });

  describe('reviseLyrics', () => {
    it('should revise lyrics based on user feedback', async () => {
      const originalLyrics = `[intro]
Test intro lyrics

[verse]
Test verse lyrics
Original line here`;

      const userFeedback = 'Change the verse to be more emotional';

      const revisedLyrics = `[intro]
Test intro lyrics

[verse]
Emotional verse lyrics
Changed line here`;

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          choices: [
            {
              message: {
                content: revisedLyrics,
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300,
          },
        },
      });

      const result = await openaiService.reviseLyrics(originalLyrics, userFeedback);

      expect(result.lyrics).toBe(revisedLyrics);
      expect(result.tokenUsage).toEqual({
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
      });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '/chat/completions',
        expect.objectContaining({
          model: 'gpt-4-turbo-preview',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('şarkı sözü editörü'),
            }),
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining(originalLyrics),
            }),
          ]),
        })
      );
    });

    it('should preserve format tags in revised lyrics', async () => {
      const originalLyrics = '[intro]\nTest\n[verse]\nVerse';
      const userFeedback = 'Make it happier';
      const revisedLyrics = '[intro]\nHappy Test\n[verse]\nHappy Verse';

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: revisedLyrics } }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 60,
            total_tokens: 110,
          },
        },
      });

      const result = await openaiService.reviseLyrics(originalLyrics, userFeedback);

      expect(result.lyrics).toContain('[intro]');
      expect(result.lyrics).toContain('[verse]');
    });

    it('should throw error when OpenAI returns empty response', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: '' } }],
        },
      });

      await expect(
        openaiService.reviseLyrics('test lyrics', 'test feedback')
      ).rejects.toThrow('OpenAI boş yanıt döndürdü');
    });

    it('should throw error when OpenAI API fails', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('API Error'));

      await expect(
        openaiService.reviseLyrics('test lyrics', 'test feedback')
      ).rejects.toThrow('Şarkı sözü revizyonu hatası');
    });

    it('should include user feedback in the request', async () => {
      const originalLyrics = 'test';
      const userFeedback = 'make it more romantic';

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: 'revised' } }],
        },
      });

      await openaiService.reviseLyrics(originalLyrics, userFeedback);

      const callArgs = mockAxiosInstance.post.mock.calls[0][1];
      const userMessage = callArgs.messages.find((m: any) => m.role === 'user');

      expect(userMessage.content).toContain(userFeedback);
      expect(userMessage.content).toContain(originalLyrics);
    });
  });
});
