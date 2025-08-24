import { LlmType } from '@app/config';
import { ChatDeepSeek, ChatDeepSeekInput } from '@langchain/deepseek';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateDeepSeekLLMDto } from '../llm/dto/create.dto';

@Injectable()
export class LlmService {
  private llmCache: Record<LlmType, ChatDeepSeek | null>;

  @Inject()
  private configService: ConfigService;

  constructor() {
    this.llmCache = {
      [LlmType.Basic]: null,
      [LlmType.Reasoning]: null,
      [LlmType.Version]: null,
    };
  }

  createDeepseekLLM(createDeepSeekLLMDto: CreateDeepSeekLLMDto) {
    const params = { ...createDeepSeekLLMDto } as ChatDeepSeekInput;
    if (createDeepSeekLLMDto.baseUrl) {
      params.configuration = { baseURL: createDeepSeekLLMDto.baseUrl };
    }
    return new ChatDeepSeek(params);
  }

  getLLMByType(type: LlmType) {
    if (this.llmCache[type]) {
      return this.llmCache[type];
    } else if (type === LlmType.Reasoning) {
      const llm = this.createDeepseekLLM({
        model: this.configService.get('REASONING_MODEL'),
        baseUrl: this.configService.get('REASONING_BASE_URL'),
        apiKey: this.configService.get('REASONING_API_KEY'),
      });
      this.llmCache[type] = llm;
      return this.llmCache[type];
    } else if (type === LlmType.Basic) {
      // 暂时还是用deepseek
      const llm = this.createDeepseekLLM({
        model: this.configService.get('REASONING_MODEL'),
        baseUrl: this.configService.get('REASONING_BASE_URL'),
        apiKey: this.configService.get('REASONING_API_KEY'),
      });
      this.llmCache[type] = llm;
      return this.llmCache[type];
    } else if (type === LlmType.Version) {
      // 暂时还是用deepseek
      const llm = this.createDeepseekLLM({
        model: this.configService.get('REASONING_MODEL'),
        baseUrl: this.configService.get('REASONING_BASE_URL'),
        apiKey: this.configService.get('REASONING_API_KEY'),
      });
      this.llmCache[type] = llm;
      return this.llmCache[type];
    }
  }
}
