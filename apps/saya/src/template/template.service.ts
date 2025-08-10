import { Injectable } from '@nestjs/common';
import { ApplyTemplateDto } from './dto/apply.dto';
import { PromptTemplate } from '@langchain/core/prompts';

@Injectable()
export class TemplateService {
  getPromptTemplate(name: string) {
    // todo 获取md形式的模版
    return name;
  }

  applyPromptTemplate(applyTemplateDto: ApplyTemplateDto) {
    const systemPrompt = new PromptTemplate({
      inputVariables: ['CURRENT_TIME'],
      template: this.getPromptTemplate(applyTemplateDto.name),
    }).format;

    return [
      {
        //   role: 'system';
        //   content: systemPrompt;
      },
    ];

    // join(
    //   applyTemplateDto.state.messages,
    // );
  }
}
