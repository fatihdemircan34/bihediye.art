import { AIConversationService } from '../ai-conversation.service';
import { OpenAIService } from '../openai.service';

describe('AIConversationService - Lyrics Review', () => {
  let aiConversationService: AIConversationService;
  let mockOpenAIService: jest.Mocked<OpenAIService>;

  beforeEach(() => {
    // Mock OpenAI service
    mockOpenAIService = {
      generateText: jest.fn(),
    } as any;

    aiConversationService = new AIConversationService(mockOpenAIService);
  });

  describe('parseLyricsReview', () => {
    it('should detect approval with "onayla" keyword', async () => {
      const result = await aiConversationService.parseLyricsReview('onayla');

      expect(result.action).toBe('approve');
      expect(result.response).toContain('onaylandı');
    });

    it('should detect approval with "evet" keyword', async () => {
      const result = await aiConversationService.parseLyricsReview('evet tamam');

      expect(result.action).toBe('approve');
    });

    it('should detect approval with number "1"', async () => {
      const result = await aiConversationService.parseLyricsReview('1');

      expect(result.action).toBe('approve');
    });

    it('should detect revision request with "revize" keyword', async () => {
      const result = await aiConversationService.parseLyricsReview('revize et lütfen');

      expect(result.action).toBe('revise');
      expect(result.revisionRequest).toBe('revize et lütfen');
    });

    it('should detect revision request with "düzelt" keyword', async () => {
      const result = await aiConversationService.parseLyricsReview('düzelt şunu');

      expect(result.action).toBe('revise');
    });

    it('should detect revision request with long feedback message', async () => {
      const longFeedback = 'nakarat kısmını daha duygusal yapabilir misin ve köprüde daha fazla detay olsun';
      const result = await aiConversationService.parseLyricsReview(longFeedback);

      expect(result.action).toBe('revise');
      expect(result.revisionRequest).toBe(longFeedback);
    });

    it('should return null action for unclear input', async () => {
      const result = await aiConversationService.parseLyricsReview('ne');

      expect(result.action).toBeNull();
      expect(result.response).toContain('onaylıyor musunuz');
    });

    it('should return null action for very short unclear input', async () => {
      const result = await aiConversationService.parseLyricsReview('ok');

      expect(result.action).toBeNull();
    });
  });
});
