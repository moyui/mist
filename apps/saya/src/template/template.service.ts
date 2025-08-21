import { SystemMessage } from '@langchain/core/messages';
import { PromptTemplate } from '@langchain/core/prompts';
import { Injectable } from '@nestjs/common';
import { ApplyTemplateDto } from './dto/apply.dto';

@Injectable()
export class TemplateService {
  getPromptTemplate(name: string) {
    // todo 获取md形式的模版
    return name;
  }

  async applyPromptTemplate(applyTemplateDto: ApplyTemplateDto) {
    const systemPrompt = await new PromptTemplate({
      inputVariables: ['CURRENT_TIME'],
      template: this.getPromptTemplate(applyTemplateDto.name),
    }).format({ CURRENT_TIME: Date.now() });

    return [
      new SystemMessage(systemPrompt),
      ...applyTemplateDto.state['messages'],
    ];
  }
}
